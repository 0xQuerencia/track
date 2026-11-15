import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { listMedia, mediaStatusCounts, progressPercent, resolveMediaFilter } from "./query";

beforeEach(() => {
  installTestDb();
  const insert = getDb().prepare(
    `INSERT INTO media_items (title, kind, status, rating, notes, progress_current, progress_total, started_on, finished_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run("Alpha Book", "Book", "In progress", 7, "slow start", 120, 300, "2026-10-01", null);
  insert.run("beta anime", "Anime", "Done", 9, "100% good", 24, 24, "2026-09-01", "2026-09-20");
  insert.run("Gamma show", "Series", "Planned", null, "_under_score", null, null, null, null);
  insert.run("Delta manga", "Manga", "Dropped", 3, null, 50, 0, "2026-08-01", null);
  insert.run("Epsilon pod", "Podcast", "Done", 8, "", 10, 40, null, "2026-11-01");
});
afterEach(() => closeTestDb());
after(() => closeTestDb());

const titles = (rows: readonly Record<string, unknown>[]) => rows.map((row) => String(row.title));

describe("resolveMediaFilter", () => {
  it("drops unknown kinds, statuses, lists and sorts instead of passing them to SQL", () => {
    const resolved = resolveMediaFilter({
      kind: "Book; DROP TABLE media_items",
      status: "Done' OR 1=1",
      list: "everything",
      sort: "random()",
      q: "  hello  ",
    });
    assert.deepEqual(resolved, { kind: null, status: null, list: "all", q: "hello", sort: "status" });
  });

  it("keeps valid choices and caps the search length", () => {
    const resolved = resolveMediaFilter({ kind: "Anime", status: "Done", list: "watching", sort: "rating", q: "x".repeat(200) });
    assert.equal(resolved.kind, "Anime");
    assert.equal(resolved.status, "Done");
    assert.equal(resolved.list, "watching");
    assert.equal(resolved.sort, "rating");
    assert.equal(resolved.q.length, 80);
  });
});

describe("listMedia", () => {
  it("filters by status and by kind", () => {
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ status: "Done" }))).sort(), ["Epsilon pod", "beta anime"].sort());
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ kind: "Book" }))), ["Alpha Book"]);
  });

  it("groups kinds into reading and watching lists", () => {
    assert.deepEqual(
      titles(listMedia(resolveMediaFilter({ list: "reading", sort: "title" }))),
      ["Alpha Book", "Delta manga"],
    );
    assert.deepEqual(
      titles(listMedia(resolveMediaFilter({ list: "watching", sort: "title" }))),
      ["beta anime", "Gamma show"],
    );
  });

  it("searches title and notes case-insensitively and treats % and _ as plain text", () => {
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ q: "BETA" }))), ["beta anime"]);
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ q: "100%" }))), ["beta anime"]);
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ q: "_under" }))), ["Gamma show"]);
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ q: "%" }))).length, 1);
  });

  it("sorts by rating (unrated last) and by progress fraction", () => {
    assert.deepEqual(titles(listMedia(resolveMediaFilter({ sort: "rating" }))), [
      "beta anime",
      "Epsilon pod",
      "Alpha Book",
      "Delta manga",
      "Gamma show",
    ]);
    const byProgress = titles(listMedia(resolveMediaFilter({ sort: "progress" })));
    assert.equal(byProgress[0], "beta anime", "24/24 is complete and comes first");
    assert.equal(byProgress[byProgress.length - 1], "Gamma show", "no progress recorded sorts last");
  });

  it("sorts finished items by their finish date, newest first", () => {
    const rows = listMedia(resolveMediaFilter({ sort: "finished" }));
    assert.equal(rows[0].title, "Epsilon pod");
    assert.equal(rows[1].title, "beta anime");
  });
});

describe("mediaStatusCounts", () => {
  it("counts each status and the total", () => {
    const counts = mediaStatusCounts();
    assert.equal(counts.All, 5);
    assert.equal(counts.Done, 2);
    assert.equal(counts["In progress"], 1);
    assert.equal(counts.Planned, 1);
    assert.equal(counts.Dropped, 1);
  });
});

describe("progressPercent", () => {
  it("returns a whole percent only when both values are recorded and the total is positive", () => {
    assert.equal(progressPercent(120, 300), 40);
    assert.equal(progressPercent(400, 300), 100);
    assert.equal(progressPercent(null, 300), null);
    assert.equal(progressPercent(10, null), null);
    assert.equal(progressPercent(10, 0), null);
    assert.equal(progressPercent("12", "24"), 50);
  });
});
