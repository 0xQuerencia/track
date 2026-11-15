import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { runDailyCycle } from "./cycle";
import { getAiDisclosurePreview, getSourcesPrivacy, listBriefs, listGraphLinks, listInsights, listSourceRecords, listSuggestions } from "./queries";
import { seedFakeDreamerSources } from "./testing/fixture";

let db: ReturnType<typeof installTestDb>;
beforeEach(() => { db = installTestDb(); });
afterEach(() => closeTestDb());

describe("Dreamer view data for each tab", () => {
  it("supports every empty state with an empty local database", () => {
    assert.deepEqual(listInsights(db), []);
    assert.deepEqual(listSuggestions(db), []);
    assert.deepEqual(listGraphLinks(db), []);
    assert.deepEqual(listBriefs(db, "daily"), []);
    assert.deepEqual(listBriefs(db, "weekly"), []);
    assert.equal(listSourceRecords(db).length, 0);
    assert.equal(getAiDisclosurePreview(db).items.length, 0);
    assert.equal(getSourcesPrivacy(db).sources.length, 3);
  });

  it("provides evidence-linked tab data from the test-only fake fixture", async () => {
    seedFakeDreamerSources(db);
    await runDailyCycle(db, new Date("2026-11-15T12:00:00Z"));
    assert.ok(listInsights(db).length > 0);
    assert.ok(listSuggestions(db).length > 0);
    assert.ok(listGraphLinks(db).length > 0);
    assert.equal(listSourceRecords(db).length, 4);
    assert.ok(getAiDisclosurePreview(db).items.length > 0);
    assert.equal(listBriefs(db, "daily").length, 1);
    const suggestion = listSuggestions(db)[0];
    assert.ok(suggestion?.evidence.every((item) => item.href.startsWith("/")));
    assert.ok(listBriefs(db, "daily")[0]?.body_md.includes("Suggestions:"));
  });
});
