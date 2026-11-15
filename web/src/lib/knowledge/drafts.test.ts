import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeDraft, draftDiffers, draftKey, encodeDraft } from "./drafts";

describe("draft recovery helpers", () => {
  it("round-trips a draft and reports when it was saved", () => {
    const raw = encodeDraft({ title: "Half", body: "typed" }, new Date("2026-11-15T10:00:00Z"));
    const draft = decodeDraft(raw);
    assert.deepEqual(draft?.values, { title: "Half", body: "typed" });
    assert.equal(draft?.savedAt, "2026-11-15T10:00:00.000Z");
  });

  it("treats malformed or foreign stored values as no draft", () => {
    for (const raw of [null, "", "not json", "[]", "null", JSON.stringify({ v: 2, savedAt: "x", values: {} }), JSON.stringify({ v: 1, values: {} })]) {
      assert.equal(decodeDraft(raw), null, String(raw));
    }
  });

  it("drops non-string field values instead of trusting them", () => {
    const raw = JSON.stringify({ v: 1, savedAt: "2026-01-01T00:00:00.000Z", values: { title: "ok", body: { evil: true }, n: 3 } });
    assert.deepEqual(decodeDraft(raw)?.values, { title: "ok" });
  });

  it("finds a difference only when a field really changed", () => {
    assert.equal(draftDiffers({ a: "1", b: "" }, { a: "1" }), false, "empty equals missing");
    assert.equal(draftDiffers({ a: "2" }, { a: "1" }), true);
    assert.equal(draftDiffers({ a: "1", extra: "x" }, { a: "1" }), true);
  });

  it("keys drafts by feature and record id", () => {
    assert.equal(draftKey("ideas", 7), "track:draft:ideas:7");
    assert.notEqual(draftKey("ideas", 7), draftKey("notes", 7));
  });
});
