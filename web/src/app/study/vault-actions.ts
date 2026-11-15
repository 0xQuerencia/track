"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { MAX_IMAGES_PER_BATCH, MODES, RATINGS, type PracticeMode, type Rating } from "@/lib/qv/constants";
import { ingestImage, type Draft } from "@/lib/qv/ingest";
import { jobNames, runJobNow, type JobName } from "@/lib/qv/jobs";
import { generatePlan, setPlanItem } from "@/lib/qv/plan";
import { importBulk, parseBulk, restoreVault } from "@/lib/qv/portable";
import { finishSession, saveProgress, startSession } from "@/lib/qv/session";
import { saveSettings } from "@/lib/qv/settings";
import { installedLanguages } from "@/lib/qv/ocr";
import { createQuestion, deleteQuestion, gradeQuestion, setNextReview, today, undoAttempt, updateQuestion, type GradeResult, type QuestionInput } from "@/lib/qv/store";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/* Every action re-checks the session cookie; the proxy alone is not trusted. Inputs are validated again in lib/qv. */

async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/study", "layout");
const str = (d: FormData, k: string): string => (typeof d.get(k) === "string" ? (d.get(k) as string).trim() : "");
const num = (v: FormDataEntryValue | null): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export type Msg = { ok: boolean; message: string } | null;

/* ---------- capture ---------- */

export type IngestResponse = { ok: true; drafts: (Draft & { name: string })[]; errors: string[] } | { ok: false; error: string };

export async function ingestAction(data: FormData): Promise<IngestResponse> {
  await requireSession();
  const files = data.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return { ok: false, error: "No image was received." };
  if (files.length > MAX_IMAGES_PER_BATCH) return { ok: false, error: `At most ${MAX_IMAGES_PER_BATCH} images at a time.` };
  const requested = str(data, "lang") || "eng";
  const installed = await installedLanguages();
  const languages = requested.split("+").every((l) => installed.includes(l)) ? requested : "eng";
  const drafts: (Draft & { name: string })[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const result = await ingestImage(file.name, Buffer.from(await file.arrayBuffer()), { languages });
    if (result.ok) drafts.push({ ...result.draft, name: file.name });
    else errors.push(`${file.name}: ${result.error}`);
  }
  return { ok: true, drafts, errors };
}

export async function languagesAction(): Promise<string[]> {
  await requireSession();
  return installedLanguages();
}

export type DraftInput = QuestionInput & { text: string; imageIds?: number[] };

export async function saveDraftsAction(payload: string): Promise<{ ok: boolean; saved: number; errors: string[] }> {
  await requireSession();
  let drafts: DraftInput[];
  try {
    drafts = JSON.parse(payload) as DraftInput[];
    if (!Array.isArray(drafts) || drafts.length > 100) throw new Error("bad");
  } catch {
    return { ok: false, saved: 0, errors: ["The form data could not be read."] };
  }
  let saved = 0;
  const errors: string[] = [];
  const db = getDb();
  drafts.forEach((d, i) => {
    const r = createQuestion({ ...d, imageIds: (d.imageIds ?? []).filter((n) => Number.isInteger(n)) }, db);
    if (r.ok) saved += 1;
    else errors.push(`Question ${i + 1}: ${r.error}`);
  });
  refresh();
  return { ok: errors.length === 0, saved, errors };
}

/* ---------- editing and grading ---------- */

export async function updateQuestionAction(_prev: Msg, data: FormData): Promise<Msg> {
  await requireSession();
  const id = num(data.get("id"));
  if (!id) return { ok: false, message: "Missing question." };
  const chapter = str(data, "chapterId");
  const result = updateQuestion(id, {
    text: str(data, "text"),
    chapterId: chapter ? Number(chapter) : null,
    subject: str(data, "subject") || null,
    topic: str(data, "topic"),
    subtopic: str(data, "subtopic"),
    qtype: str(data, "qtype"),
    difficulty: str(data, "difficulty"),
    source: str(data, "source"),
    examCategory: str(data, "examCategory"),
    tags: str(data, "tags"),
    correctAnswer: str(data, "correctAnswer"),
    solution: str(data, "solution"),
    notes: str(data, "notes"),
    mistakeCategory: str(data, "mistakeCategory") || null,
    importance: num(data.get("importance")),
  });
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Saved." } : { ok: false, message: result.error };
}

export async function deleteQuestionAction(id: number): Promise<Msg> {
  await requireSession();
  const r = deleteQuestion(id);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: "Deleted." } : { ok: false, message: r.error };
}

export type GradeResponse = { ok: true; result: GradeResult } | { ok: false; error: string };

export async function gradeAction(id: number, rating: Rating, opts: { seconds?: number; hintUsed?: boolean; mistakeCategory?: string | null; sessionId?: number | null } = {}): Promise<GradeResponse> {
  await requireSession();
  if (!(RATINGS as readonly string[]).includes(rating)) return { ok: false, error: "Bad rating." };
  const r = gradeQuestion(id, rating, { seconds: opts.seconds, hintUsed: opts.hintUsed, mistakeCategory: opts.mistakeCategory, sessionId: opts.sessionId ?? null });
  if (!r.ok) return r.error ? { ok: false, error: r.error } : { ok: false, error: "Could not grade." };
  refresh();
  return { ok: true, result: r.result };
}

export async function undoAction(attemptId: number): Promise<Msg> {
  await requireSession();
  const r = undoAttempt(attemptId);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: "Undone." } : { ok: false, message: r.error };
}

export async function setMistakeAction(attemptId: number, category: string): Promise<Msg> {
  await requireSession();
  const db = getDb();
  const row = db.prepare("SELECT question_id FROM qv_attempts WHERE id = ?").get(attemptId) as { question_id: number } | undefined;
  if (!row) return { ok: false, message: "Attempt not found." };
  const r = updateQuestion(row.question_id, { mistakeCategory: category });
  db.prepare("UPDATE qv_attempts SET mistake_category = ? WHERE id = ? AND rating != 'green'").run(category || null, attemptId);
  if (r.ok) refresh();
  return { ok: r.ok, message: r.ok ? "Noted." : r.error };
}

export async function nextReviewAction(id: number, date: string): Promise<Msg> {
  await requireSession();
  const r = setNextReview(id, date);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: "Review date moved." } : { ok: false, message: r.error };
}

/* ---------- import, export, restore ---------- */

export async function bulkImportAction(_prev: Msg, data: FormData): Promise<Msg> {
  await requireSession();
  let rows;
  try {
    rows = parseBulk(str(data, "text"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not read that." };
  }
  if (!rows.length) return { ok: false, message: "Paste at least one question." };
  const chapter = str(data, "chapterId");
  const out = importBulk(rows, { chapterId: chapter ? Number(chapter) : undefined, source: str(data, "source") || undefined, difficulty: str(data, "difficulty") || undefined }, getDb());
  refresh();
  return { ok: out.created > 0, message: `${out.created} imported${out.failed.length ? `, ${out.failed.length} skipped (${out.failed[0].error})` : ""}.` };
}

export async function restoreAction(_prev: Msg, data: FormData): Promise<Msg> {
  await requireSession();
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a backup file." };
  if (file.size > 200 * 1024 * 1024) return { ok: false, message: "That file is too large." };
  try {
    const r = restoreVault(JSON.parse(await file.text()));
    refresh();
    return { ok: true, message: `Restored ${r.restored}, skipped ${r.skipped} already present${r.unlinkedChapters ? `, ${r.unlinkedChapters} with a chapter that no longer exists` : ""}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Restore failed." };
  }
}

/* ---------- settings, jobs, plan ---------- */

export async function saveSettingsAction(_prev: Msg, data: FormData): Promise<Msg> {
  await requireSession();
  const ladder = str(data, "ladder").split(/[,\s]+/).filter(Boolean).map(Number);
  const r = saveSettings({
    redDays: num(data.get("redDays")), yellowDays: num(data.get("yellowDays")), greenDays: num(data.get("greenDays")), ladder: ladder.length ? ladder : undefined,
    maxIntervalDays: num(data.get("maxIntervalDays")), examWindowDays: num(data.get("examWindowDays")), maxDailyReviews: num(data.get("maxDailyReviews")),
    weekdayMinutes: num(data.get("weekdayMinutes")), weekendMinutes: num(data.get("weekendMinutes")), minutesPerQuestion: num(data.get("minutesPerQuestion")),
    dayStart: str(data, "dayStart") || undefined, dayEnd: str(data, "dayEnd") || undefined, planTime: str(data, "planTime") || undefined,
    reminderTime: str(data, "reminderTime") || undefined, eveningTime: str(data, "eveningTime") || undefined, weeklyTime: str(data, "weeklyTime") || undefined,
    weeklyDay: num(data.get("weeklyDay")), timezone: str(data, "timezone") || undefined, jobsEnabled: data.get("jobsEnabled") === "on",
  });
  if (!r.ok) return { ok: false, message: r.error };
  // Availability changed: rebuild today's plan so it reflects the new numbers.
  generatePlan(today(getDb()), getDb(), { now: new Date() });
  refresh();
  return { ok: true, message: "Settings saved and today's plan rebuilt." };
}

export async function runJobAction(name: string): Promise<Msg> {
  await requireSession();
  if (!jobNames().some((j) => j.name === name)) return { ok: false, message: "Unknown job." };
  const out = runJobNow(name as JobName);
  refresh();
  return out.result === "ran" ? { ok: true, message: "Job finished." } : { ok: false, message: out.error ?? "Job failed." };
}

export async function replanAction(): Promise<Msg> {
  await requireSession();
  const r = generatePlan(today(getDb()), getDb(), { now: new Date() });
  refresh();
  return { ok: true, message: `${r.placed} blocks planned, ${r.deferred} deferred.` };
}

export async function planItemAction(id: number, change: { locked?: boolean; status?: "planned" | "done" }): Promise<Msg> {
  await requireSession();
  const ok = setPlanItem(id, change);
  refresh();
  return { ok, message: ok ? "Updated." : "Not found." };
}

export async function readNotificationsAction(): Promise<void> {
  await requireSession();
  getDb().prepare("UPDATE qv_notifications SET read_at = datetime('now') WHERE read_at IS NULL").run();
  refresh();
}

/* ---------- practice ---------- */

export async function startPracticeAction(data: FormData): Promise<void> {
  await requireSession();
  const mode = str(data, "mode") as PracticeMode;
  const chapter = num(data.get("chapterId"));
  const r = startSession((MODES as readonly string[]).includes(mode) ? mode : "mixed", {
    chapterId: chapter, subject: str(data, "subject") || undefined, limit: num(data.get("limit")), timedMinutes: num(data.get("timedMinutes")),
  });
  if (!r.ok) redirect(`/study/practice?error=${encodeURIComponent(r.error)}`);
  redirect(`/study/practice?session=${r.sessionId}`);
}

export async function progressAction(sessionId: number, position: number, seconds: number): Promise<void> {
  await requireSession();
  saveProgress(sessionId, position, seconds);
}

export async function finishPracticeAction(sessionId: number): Promise<{ answered: number; red: number; yellow: number; green: number; minutes: number; accuracyPct: number | null } | null> {
  await requireSession();
  const r = finishSession(sessionId);
  refresh();
  revalidatePath("/");
  return r;
}
