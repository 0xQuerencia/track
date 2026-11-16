import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { addDays } from "../dates";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { ingestImage } from "./ingest";
import { storeImage, loadImage, sniffImage } from "./images";
import { jobStatus, latestSlot, rebalance, runDueJobs, runJobNow } from "./jobs";
import { parseTsv, splitQuestions, runOcr } from "./ocr";
import { freeWindows, packDay, toMin, type Candidate } from "./pack";
import { generatePlan, planItems, setPlanItem } from "./plan";
import { exportVault, importBulk, parseBulk, restoreVault } from "./portable";
import { getSettings, saveSettings } from "./settings";
import { attemptsFor, createQuestion, getQuestion, gradeQuestion, listQuestions, masteryByChapter, undoAttempt } from "./store";
import { insights, mistakePatterns, weeklySummary } from "./insights";
import { DEFAULT_SETTINGS } from "./constants";

// 2026-11-16 10:00 IST = 04:30 UTC
const NOON = new Date("2026-11-16T06:30:00Z");
const DAY = "2026-11-16";
let db: DatabaseSync;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body-1")]);
const PNG2 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body-2")]);

beforeEach(() => {
  db = installTestDb();
  db.exec("DELETE FROM chapters");
  db.exec("DELETE FROM exams");
  db.prepare("INSERT INTO qv_settings (key, value) VALUES ('timezone', '\"Asia/Kolkata\"')").run();
});
afterEach(() => closeTestDb());

const chapter = (name = "Limits", subject = "Mathematics") =>
  Number(db.prepare("INSERT INTO chapters (subject, klass, track, name, priority, mastery, done) VALUES (?, '12', 'Both', ?, 'Medium', 0, 1)").run(subject, name).lastInsertRowid);
const question = (text = "Find the limit", chapterId: number | null = null) => {
  const r = createQuestion({ text, chapterId }, db);
  assert.ok(r.ok);
  return (r as { id: number }).id;
};

describe("images and OCR", () => {
  it("accepts real image bytes and rejects other files", () => {
    assert.equal(sniffImage(PNG), "image/png");
    const bad = storeImage(Buffer.from("<script>alert(1)</script>"), db);
    assert.equal(bad.ok, false);
    assert.equal(storeImage(Buffer.alloc(0), db).ok, false);
    assert.equal(storeImage(Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]), db).ok, false);
  });
  it("deduplicates identical screenshots", () => {
    const a = storeImage(PNG, db);
    const b = storeImage(PNG, db);
    assert.ok(a.ok && b.ok);
    assert.equal((a as { image: { imageId: number } }).image.imageId, (b as { image: { imageId: number } }).image.imageId);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM qv_images").get() as { n: number }).n, 1);
    assert.deepEqual(loadImage((a as { image: { imageId: number } }).image.imageId, db)?.data, PNG);
  });
  it("reads a pasted screenshot into an editable draft and keeps the image", async () => {
    const tsv = "level\tpage\tblock\tpar\tline\tword\tl\tt\tw\th\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tFind\n5\t1\t1\t1\t1\t2\t0\t0\t1\t1\t80\tlimit";
    const r = await ingestImage("paste.png", PNG, { db, runner: async () => tsv });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.draft.status, "ok");
    assert.equal(r.draft.parts[0].text, "Find limit");
    assert.equal(r.draft.confidence, 85);
    const saved = createQuestion({ text: "Find lim x→0 sin x / x", imageIds: [r.draft.imageId] }, db);
    assert.ok(saved.ok);
    assert.equal(getQuestion((saved as { id: number }).id, db)?.image_count, 1);
    assert.equal((db.prepare("SELECT status FROM qv_ocr").get() as { status: string }).status, "ok");
  });
  it("a second paste of the same screenshot reuses the stored text", async () => {
    let calls = 0;
    const runner = async () => (calls++, "level\tpage\tblock\tpar\tline\tword\tl\tt\tw\th\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tHello");
    await ingestImage("a.png", PNG, { db, runner });
    const again = await ingestImage("b.png", PNG, { db, runner });
    assert.equal(calls, 1);
    assert.ok(again.ok && again.draft.status === "reused");
  });
  it("OCR failure leaves the screenshot saved and says what happened", async () => {
    const missing = await ingestImage("a.png", PNG2, { db, runner: async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); } });
    assert.ok(missing.ok);
    if (missing.ok) {
      assert.equal(missing.draft.status, "unavailable");
      assert.match(missing.draft.error ?? "", /Tesseract is not installed/);
      assert.equal(missing.draft.parts[0].text, "");
    }
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM qv_images").get() as { n: number }).n, 1);
    const crashed = await runOcr(PNG, "eng", async () => { throw new Error("boom"); });
    assert.equal(crashed.status, "failed");
    const rejected = await runOcr(PNG, "../../etc", async () => "");
    assert.equal(rejected.status, "failed");
  });
  it("warns that equations may be misread", async () => {
    const out = await runOcr(PNG, "eng", async () => "level\tpage\tblock\tpar\tline\tword\tl\tt\tw\th\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t50\tx^2+y=0");
    assert.equal(out.status, "ok");
    assert.ok(out.warnings.length >= 2);
  });
  it("splits one screenshot into several questions and detects options", () => {
    const text = "1. What is 2+2?\n(A) 3\n(B) 4\n(C) 5\n2. Define velocity.\n3. Find the root of x-1=0.";
    const r = splitQuestions(text);
    assert.equal(r.multiple, true);
    assert.equal(r.parts.length, 3);
    assert.equal(r.parts[0].options.length, 3);
    assert.equal(splitQuestions("A body moves.\n1) one\n2) two\n3) three").multiple, false);
    assert.equal(parseTsv("header").text, "");
  });
});

describe("questions and grading", () => {
  it("needs text or a screenshot, validates chapter, never invents answers", () => {
    assert.equal(createQuestion({ text: "  " }, db).ok, false);
    assert.equal(createQuestion({ text: "q", chapterId: 999 }, db).ok, false);
    const id = question("Evaluate", chapter());
    const q = getQuestion(id, db);
    assert.equal(q?.correct_answer, null);
    assert.equal(q?.solution, null);
    assert.equal(q?.state, "unassessed");
    assert.equal(q?.subject, "Mathematics");
    assert.equal(q?.next_review, null);
  });
  it("red, yellow and green schedule 1, 3 and 7 days and keep history", () => {
    const [a, b, c] = [question("a"), question("b"), question("c")];
    const red = gradeQuestion(a, "red", { now: NOON, mistakeCategory: "Formula forgotten" }, db);
    const yellow = gradeQuestion(b, "yellow", { now: NOON }, db);
    const green = gradeQuestion(c, "green", { now: NOON }, db);
    assert.ok(red.ok && yellow.ok && green.ok);
    assert.equal(getQuestion(a, db)?.next_review, addDays(DAY, 1));
    assert.equal(getQuestion(b, db)?.next_review, addDays(DAY, 3));
    assert.equal(getQuestion(c, db)?.next_review, addDays(DAY, 7));
    assert.equal(getQuestion(a, db)?.mistake_category, "Formula forgotten");
    assert.equal(getQuestion(c, db)?.successes, 1);
    assert.equal(attemptsFor(a, db).length, 1);
  });
  it("a hint turns green into yellow", () => {
    const id = question();
    const r = gradeQuestion(id, "green", { hintUsed: true, now: NOON }, db);
    assert.ok(r.ok);
    assert.equal((r as { result: { downgraded: boolean; state: string } }).result.state, "yellow");
    assert.equal(getQuestion(id, db)?.successes, 0);
  });
  it("a mastered question that fails returns to day one", () => {
    const id = question();
    gradeQuestion(id, "green", { now: NOON }, db);
    gradeQuestion(id, "green", { now: new Date("2026-11-23T06:30:00Z") }, db);
    assert.equal(getQuestion(id, db)?.interval_days, 14);
    gradeQuestion(id, "red", { now: new Date("2026-12-07T06:30:00Z") }, db);
    const q = getQuestion(id, db);
    assert.equal(q?.state, "red");
    assert.equal(q?.next_review, "2026-12-08");
    assert.equal(q?.lapses, 1);
  });
  it("undo restores the earlier state and keeps the attempt, voided", () => {
    const id = question();
    gradeQuestion(id, "green", { now: NOON }, db);
    const second = gradeQuestion(id, "red", { now: NOON }, db) as { result: { attemptId: number } };
    assert.equal(undoAttempt(second.result.attemptId, db).ok, true);
    const q = getQuestion(id, db);
    assert.equal(q?.state, "green");
    assert.equal(q?.attempts, 1);
    assert.equal(attemptsFor(id, db).filter((a) => a.voided).length, 1);
    assert.equal(undoAttempt(second.result.attemptId, db).ok, false);
    const first = attemptsFor(id, db).find((a) => !a.voided)!;
    assert.equal(undoAttempt(first.id, db).ok, true);
    assert.equal(getQuestion(id, db)?.state, "unassessed");
  });
  it("late reviews get credit; overdue greens lower chapter mastery", () => {
    const ch = chapter();
    const ids = Array.from({ length: 5 }, (_, i) => question(`q${i}`, ch));
    for (const id of ids) gradeQuestion(id, "green", { now: NOON }, db);
    const fresh = masteryByChapter(DAY, db).get(ch)!;
    const stale = masteryByChapter(addDays(DAY, 30), db).get(ch)!;
    assert.equal(fresh.overdue, 0);
    assert.equal(stale.overdue, 5);
    assert.ok((stale.mastery as number) < (fresh.mastery as number));
  });
  it("exam proximity shortens the interval", () => {
    db.prepare("INSERT INTO exams (name, date, track) VALUES ('Boards', ?, 'Both')").run(addDays(DAY, 8));
    const id = question();
    gradeQuestion(id, "green", { now: NOON }, db);
    assert.equal(getQuestion(id, db)?.interval_days, 4);
  });
  it("timezone: 23:30 UTC on the 15th is already the 16th in Kolkata", () => {
    const id = question();
    gradeQuestion(id, "red", { now: new Date("2026-11-15T23:30:00Z") }, db);
    assert.equal(attemptsFor(id, db)[0].date, "2026-11-16");
    assert.equal(getQuestion(id, db)?.next_review, "2026-11-17");
  });
  it("filters, searches and pages; escapes LIKE wildcards", () => {
    question("100% sure");
    question("other");
    assert.equal(listQuestions({ q: "100%" }, db).total, 1);
    assert.equal(listQuestions({ q: "_" }, db).total, 0);
    assert.equal(listQuestions({ state: "red" }, db).total, 0);
  });
});

describe("settings", () => {
  it("validates and persists", () => {
    assert.equal(saveSettings({ redDays: 0 }, db).ok, false);
    assert.equal(saveSettings({ planTime: "25:00" }, db).ok, false);
    assert.equal(saveSettings({ timezone: "Mars/Base" }, db).ok, false);
    assert.equal(saveSettings({ ladder: [3, 2] }, db).ok, false);
    assert.equal(saveSettings({ yellowDays: 4, planTime: "04:30" }, db).ok, true);
    const s = getSettings(db);
    assert.equal(s.yellowDays, 4);
    assert.equal(s.planTime, "04:30");
    assert.equal(s.redDays, DEFAULT_SETTINGS.redDays);
  });
  it("configurable intervals change scheduling", () => {
    saveSettings({ yellowDays: 5 }, db);
    const id = question();
    gradeQuestion(id, "yellow", { now: NOON }, db);
    assert.equal(getQuestion(id, db)?.next_review, addDays(DAY, 5));
  });
});

describe("bulk import and backup", () => {
  it("parses numbered text, blocks and JSON; reports bad rows", () => {
    assert.equal(parseBulk("1. A\n2. B\n3. C").length, 3);
    assert.equal(parseBulk("first\n\nsecond").length, 2);
    assert.equal(parseBulk('[{"text":"x","tags":["a","b"]},{"text":""}]').length, 2);
    assert.throws(() => parseBulk("[not json"));
    const res = importBulk(parseBulk('[{"text":"x","tags":["a","b"]},{"text":""}]'), { source: "PYQ" }, db);
    assert.equal(res.created, 1);
    assert.equal(res.failed.length, 1);
    assert.equal(listQuestions({ source: "PYQ" }, db).total, 1);
  });
  it("exports and restores everything, twice safely", async () => {
    const ch = chapter();
    const img = await ingestImage("a.png", PNG, { db, runner: async () => "level\tpage\tblock\tpar\tline\tword\tl\tt\tw\th\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tHi" });
    assert.ok(img.ok);
    const id = (createQuestion({ text: "Hi", chapterId: ch, imageIds: [img.ok ? img.draft.imageId : 0] }, db) as { id: number }).id;
    gradeQuestion(id, "red", { now: NOON }, db);
    const backup = JSON.parse(JSON.stringify(exportVault(db)));
    db.exec("DELETE FROM qv_questions");
    const r1 = restoreVault(backup, db);
    assert.equal(r1.restored, 1);
    const q = listQuestions({}, db).rows[0];
    assert.equal(q.state, "red");
    assert.equal(q.chapter_id, ch);
    assert.equal(q.image_count, 1);
    assert.equal(attemptsFor(q.id, db).length, 1);
    assert.equal(restoreVault(backup, db).skipped, 1);
    assert.throws(() => restoreVault({ nope: true }, db));
  });
});

describe("planner", () => {
  const cand = (key: string, minutes: number, priority: number, prefer: "early" | "late" = "early"): Candidate => ({
    key, kind: "x", title: key, detail: null, minutes, minMinutes: minutes, priority, prefer, chapterId: null, questionIds: [], taskId: null, reason: null,
  });
  it("never overlaps busy time and defers what does not fit", () => {
    const windows = freeWindows(toMin("06:00"), toMin("10:00"), [{ start: toMin("07:00"), end: toMin("09:00") }]);
    const { placed, deferred } = packDay({ windows, budgetMinutes: 600, candidates: [cand("a", 50, 90), cand("b", 50, 80), cand("c", 120, 70)] });
    for (const p of placed) assert.ok(p.end <= toMin("07:00") || p.start >= toMin("09:00"));
    assert.ok(deferred.some((d) => d.key === "c"));
    assert.match(deferred[0].deferReason, /free slot|study time/);
  });
  it("respects the daily budget", () => {
    const { placed, deferred } = packDay({ windows: [{ start: 0, end: 1000 }], budgetMinutes: 60, candidates: [cand("a", 45, 9), cand("b", 45, 8)] });
    assert.equal(placed.length, 1);
    assert.equal(deferred.length, 1);
  });
  it("builds a plan around a calendar event and is idempotent", () => {
    const ch = chapter("Limits");
    for (let i = 0; i < 4; i++) {
      const id = question(`r${i}`, ch);
      gradeQuestion(id, "red", { now: new Date("2026-11-14T06:30:00Z") }, db);
    }
    db.prepare("INSERT INTO events (title, date, start_time, end_time, category, recurrence) VALUES ('Class', ?, '06:00', '08:00', 'Study', 'None')").run(DAY);
    const first = generatePlan(DAY, db);
    assert.ok(first.placed >= 1);
    const rows = planItems(DAY, db).filter((i) => i.status === "planned");
    for (const r of rows) assert.ok((r.start_time as string) >= "08:00", `placed at ${r.start_time}`);
    assert.ok(rows[0].title.includes("4 red questions from Limits"));
    const tasks1 = (db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title LIKE '[Plan] %'").get() as { n: number }).n;
    generatePlan(DAY, db);
    generatePlan(DAY, db);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title LIKE '[Plan] %'").get() as { n: number }).n, tasks1);
    assert.equal(planItems(DAY, db).filter((i) => i.kind === "revision").length, rows.filter((i) => i.kind === "revision").length);
  });
  it("keeps locked blocks and lets nothing overlap them", () => {
    const ch = chapter();
    gradeQuestion(question("a", ch), "red", { now: new Date("2026-11-14T06:30:00Z") }, db);
    generatePlan(DAY, db);
    const item = planItems(DAY, db).find((i) => i.kind === "revision")!;
    setPlanItem(item.id, { locked: true }, db);
    generatePlan(DAY, db);
    const after = planItems(DAY, db).find((i) => i.id === item.id)!;
    assert.equal(after.start_time, item.start_time);
    const placed = planItems(DAY, db).filter((i) => i.start_time);
    placed.sort((a, b) => (a.start_time as string).localeCompare(b.start_time as string));
    for (let i = 1; i < placed.length; i++) assert.ok((placed[i].start_time as string) >= (placed[i - 1].end_time as string));
  });
  it("completing the graded questions marks the block done", () => {
    const ch = chapter();
    const id = question("a", ch);
    gradeQuestion(id, "red", { now: new Date("2026-11-14T06:30:00Z") }, db);
    generatePlan(DAY, db);
    gradeQuestion(id, "yellow", { now: NOON }, db);
    generatePlan(DAY, db);
    assert.ok(planItems(DAY, db).some((i) => i.kind === "revision" && i.status === "done"));
  });
});

describe("jobs", () => {
  const AT = (t: string) => new Date(`2026-11-16T${t}:00+05:30`);
  it("runs once per slot, however often it is triggered", () => {
    const a = runDueJobs({ db, now: AT("05:30") });
    const b = runDueJobs({ db, now: AT("05:31") });
    assert.deepEqual(a.filter((o) => o.result === "ran").map((o) => o.job).sort(), ["exam", "plan", "weekly"]);
    assert.ok(b.every((o) => o.result === "skipped"));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM qv_job_runs WHERE job = 'plan'").get() as { n: number }).n, 1);
  });
  it("recovers after downtime by running the latest missed slot", () => {
    const out = runDueJobs({ db, now: AT("22:00") });
    assert.deepEqual(out.filter((o) => o.result === "ran").map((o) => o.job).sort(), ["evening", "exam", "plan", "weekly"]);
  });
  it("uses the Kolkata day, not UTC, for slots", () => {
    const s = { ...DEFAULT_SETTINGS, timezone: "Asia/Kolkata" };
    const plan = { name: "plan", label: "", time: (x: typeof s) => x.planTime, run: () => ({}) } as never;
    assert.equal(latestSlot(plan, s, new Date("2026-11-15T23:45:00Z")), "2026-11-16");
    assert.equal(latestSlot(plan, s, new Date("2026-11-15T22:00:00Z")), "2026-11-15");
  });
  it("weekly review runs on the configured day only", () => {
    const sunday = new Date("2026-11-15T20:30:00+05:30");
    assert.ok(runDueJobs({ db, now: sunday }).some((o) => o.job === "weekly" && o.result === "ran"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM qv_notifications WHERE kind = 'weekly'").get()?.n, 1);
    runDueJobs({ db, now: new Date("2026-11-17T20:30:00+05:30") });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM qv_job_runs WHERE job = 'weekly'").get() as { n: number }).n, 1);
  });
  it("a failed run is retried after a cool-down, and a stuck one is taken over", () => {
    db.prepare("INSERT INTO qv_job_runs (job, run_key, status, started_at, finished_at, error) VALUES ('plan', ?, 'failed', ?, ?, 'x')").run(DAY, AT("05:00").toISOString(), AT("05:00").toISOString());
    assert.equal(runDueJobs({ db, now: AT("05:05"), only: "plan" })[0].result, "skipped");
    assert.equal(runDueJobs({ db, now: AT("05:20"), only: "plan" })[0].result, "ran");
    db.prepare("DELETE FROM qv_job_runs").run();
    db.prepare("INSERT INTO qv_job_runs (job, run_key, status, started_at) VALUES ('plan', ?, 'running', ?)").run(DAY, AT("05:00").toISOString());
    assert.equal(runDueJobs({ db, now: AT("05:05"), only: "plan" })[0].result, "skipped");
    assert.equal(runDueJobs({ db, now: AT("05:30"), only: "plan" })[0].result, "ran");
  });
  it("reminder notifies once and the evening job builds tomorrow", () => {
    const id = question("a");
    gradeQuestion(id, "red", { now: new Date("2026-11-14T06:30:00Z") }, db);
    runDueJobs({ db, now: AT("22:00") });
    runJobNow("reminder", { db, now: AT("22:01") });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM qv_notifications WHERE kind = 'reminder'").get() as { n: number }).n, 1);
    assert.ok(planItems(addDays(DAY, 1), db).length > 0);
    assert.ok(jobStatus(db, AT("22:02")).every((j) => j.lastRun !== null || j.name === "weekly"));
  });
  it("can be switched off", () => {
    saveSettings({ jobsEnabled: false }, db);
    assert.deepEqual(runDueJobs({ db, now: AT("22:00") }), []);
  });
  it("exam countdown pulls reviews forward and spreads overload", () => {
    db.prepare("INSERT INTO exams (name, date, track) VALUES ('JEE', ?, 'Both')").run(addDays(DAY, 12));
    const ids = Array.from({ length: 3 }, (_, i) => question(`g${i}`));
    for (const id of ids) db.prepare("UPDATE qv_questions SET state='green', interval_days=30, next_review=? WHERE id = ?").run(addDays(DAY, 30), id);
    const s = { ...getSettings(db), maxDailyReviews: 5 };
    const r = rebalance(db, DAY, s);
    assert.equal(r.pulledForward, 3);
    assert.equal(getQuestion(ids[0], db)?.next_review, addDays(DAY, 6));
    assert.equal(rebalance(db, DAY, s).pulledForward, 0);
  });
});

describe("insights", () => {
  it("builds patterns only from recorded mistakes and says when data is thin", () => {
    const ch = chapter("Derivatives");
    const id = question("sign", ch);
    db.prepare("UPDATE qv_questions SET topic = 'Chain rule' WHERE id = ?").run(id);
    for (let i = 0; i < 3; i++) gradeQuestion(id, "red", { now: new Date(`2026-11-1${i}T06:30:00Z`), mistakeCategory: "Calculation error" }, db);
    assert.match(mistakePatterns(db)[0].text, /Calculation error.*3 times on Chain rule/);
    const list = insights(db, DAY);
    assert.match(list.find((i) => i.id === "weakest")!.answer, /Not enough data/);
    assert.equal(list.find((i) => i.id === "repeat")!.answer.includes("sign"), true);
    assert.equal(weeklySummary(db, DAY).red, 3);
  });
  it("empty vault gives honest empty answers", () => {
    const list = insights(db, DAY);
    assert.equal(list.length, 7);
    assert.match(list.find((i) => i.id === "repeat")!.answer, /No question/);
  });
});

describe("migration", () => {
  it("creates the vault tables on a database that already has data", () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'qv_%'").all() as { name: string }[]).map((t) => t.name);
    for (const t of ["qv_questions", "qv_images", "qv_ocr", "qv_attempts", "qv_sessions", "qv_plan_items", "qv_job_runs", "qv_notifications", "qv_settings"]) assert.ok(tables.includes(t), t);
    assert.ok((db.prepare("SELECT COUNT(*) AS n FROM chapters").get() as { n: number }).n === 0);
    db.exec("PRAGMA foreign_keys = ON");
    const id = question();
    db.prepare("INSERT INTO qv_images (question_id, sha256, mime, bytes, data) VALUES (?, 'h', 'image/png', 1, x'00')").run(id);
    db.prepare("DELETE FROM qv_questions WHERE id = ?").run(id);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM qv_images").get() as { n: number }).n, 0);
  });
});

import { buildQueue, finishSession, getSession, saveProgress, startSession } from "./session";

describe("practice sessions", () => {
  it("builds queues per mode, resumes, and records study data once on finish", () => {
    const ch = chapter("Limits");
    const ids = Array.from({ length: 4 }, (_, i) => question(`q${i}`, ch));
    gradeQuestion(ids[0], "red", { now: new Date("2026-11-14T06:30:00Z") }, db);
    gradeQuestion(ids[1], "green", { now: new Date("2026-11-01T06:30:00Z") }, db);
    assert.deepEqual(buildQueue("red", {}, db, DAY), [ids[0]]);
    assert.equal(buildQueue("due", {}, db, DAY).length, 2);
    assert.equal(buildQueue("chapter", { chapterId: ch }, db, DAY).length, 4);
    assert.equal(buildQueue("chapter", {}, db, DAY).length, 0);
    const started = startSession("chapter", { chapterId: ch }, db, DAY);
    assert.ok(started.ok);
    if (!started.ok) return;
    saveProgress(started.sessionId, 1, 90, db);
    const again = startSession("chapter", { chapterId: ch }, db, DAY);
    assert.ok(again.ok && again.resumed && again.sessionId === started.sessionId);
    assert.equal(getSession(started.sessionId, db)?.position, 1);
    for (const [i, id] of ids.entries()) gradeQuestion(id, i === 0 ? "red" : "green", { sessionId: started.sessionId, seconds: 60, now: NOON }, db);
    const sum = finishSession(started.sessionId, db, DAY, NOON);
    assert.equal(sum?.answered, 4);
    assert.equal(sum?.green, 3);
    finishSession(started.sessionId, db, DAY, NOON);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM study_sessions WHERE notes LIKE 'Question Vault%'").get() as { n: number }).n, 1);
    assert.equal((db.prepare("SELECT attempted FROM question_stats WHERE source = 'Question Vault'").get() as { attempted: number }).attempted, 4);
    assert.equal((db.prepare("SELECT revision_count FROM chapters WHERE id = ?").get(ch) as { revision_count: number }).revision_count, 1);
    assert.equal(startSession("due", {}, db, DAY).ok, false);
    assert.equal(startSession("pyq", {}, db, DAY).ok, false);
  });
});

describe("planner clock", () => {
  it("a rebuild during the day plans nothing in the past", () => {
    const ch = chapter();
    gradeQuestion(question("a", ch), "red", { now: new Date("2026-11-14T06:30:00Z") }, db);
    generatePlan(DAY, db, { now: new Date("2026-11-16T14:03:00+05:30") });
    for (const i of planItems(DAY, db).filter((x) => x.start_time)) assert.ok((i.start_time as string) >= "14:05", String(i.start_time));
  });
});

import { searchAll } from "../crud";
describe("search", () => {
  it("finds vault questions from the universal search", () => {
    question("Calorimetry heat capacity problem");
    const hit = searchAll("calorimetry").find((h) => h.entity === "qv_questions");
    assert.ok(hit);
    assert.match(hit!.href, /tab=vault.*#qv-/);
    assert.equal(searchAll("100%").filter((h) => h.entity === "qv_questions").length, 0);
  });
});

describe("AI screenshot reading", () => {
  const tsv = "level\tpage\tblock\tpar\tline\tword\tl\tt\tw\th\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tFallback";
  const PNG3 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("ai-body-3")]);
  it("uses the AI reading when it works, one draft per question, and reuses it for the same image", async () => {
    let calls = 0;
    const ai = async () => (calls++, { ok: true as const, questions: [{ text: "Find \\(x^2\\)", qtype: "Numerical" }, { text: "Define work", qtype: "Subjective" }] });
    const first = await ingestImage("a.png", PNG3, { db, ai, runner: async () => { throw new Error("tesseract must not run"); } });
    assert.ok(first.ok);
    if (!first.ok) return;
    assert.equal(first.draft.parts.length, 2);
    assert.equal(first.draft.parts[0].qtype, "Numerical");
    assert.match(first.draft.engine ?? "", /^ai:/);
    const again = await ingestImage("b.png", PNG3, { db, ai });
    assert.ok(again.ok && again.draft.status === "reused" && again.draft.parts.length === 2 && again.draft.parts[1].text === "Define work");
    assert.equal(calls, 1);
  });
  it("falls back to Tesseract when the AI fails or is not allowed, and says so", async () => {
    const failing = await ingestImage("a.png", PNG, { db, ai: async () => ({ ok: false as const, code: "upstream" as const }), runner: async () => tsv });
    assert.ok(failing.ok);
    if (failing.ok) {
      assert.equal(failing.draft.parts[0].text, "Fallback");
      assert.ok(failing.draft.warnings.some((w) => /AI reader failed/.test(w)));
    }
    const off = await ingestImage("b.png", PNG2, { db, ai: async () => ({ ok: false as const, code: "no_consent" as const }), runner: async () => tsv });
    assert.ok(off.ok && !off.draft.warnings.some((w) => /AI/.test(w)));
  });
  it("sends nothing without consent: the default reader is gated", async () => {
    const r = await ingestImage("c.png", Buffer.concat([PNG, Buffer.from("zzz")]), { db, runner: async () => tsv });
    assert.ok(r.ok && r.draft.parts[0].text === "Fallback");
  });
});
