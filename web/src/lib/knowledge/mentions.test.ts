import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWikiLinks } from "./mentions";

describe("wiki-link parsing", () => {
  it("reads [[Title]] and [[note:ID]] targets in order", () => {
    assert.deepEqual(parseWikiLinks("See [[Quantum notes]] and [[note:12]]."), [
      { kind: "title", title: "Quantum notes" },
      { kind: "id", id: 12 },
    ]);
  });

  it("de-duplicates repeated targets, ignoring case and spacing in titles", () => {
    const targets = parseWikiLinks("[[Plan]] [[plan]] [[  Plan  ]] [[note:3]] [[note:3]]");
    assert.deepEqual(targets, [
      { kind: "title", title: "Plan" },
      { kind: "id", id: 3 },
    ]);
  });

  it("ignores empty, multi-line and unclosed brackets", () => {
    assert.deepEqual(parseWikiLinks("[[]] [[ ]] [[a\nb]] [[open"), []);
  });

  it("handles missing bodies", () => {
    assert.deepEqual(parseWikiLinks(null), []);
    assert.deepEqual(parseWikiLinks(undefined), []);
  });

  it("caps the number of references per note", () => {
    const body = Array.from({ length: 80 }, (_, i) => `[[Title ${i}]]`).join(" ");
    assert.equal(parseWikiLinks(body).length, 50);
  });
});
