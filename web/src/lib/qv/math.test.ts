import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plainMath, splitMath } from "./math";

describe("splitMath", () => {
  it("separates inline and display maths from text", () => {
    assert.deepEqual(splitMath("Find \\(x^2\\) then \\[y=1\\] ok"), [
      { kind: "text", value: "Find " }, { kind: "inline", value: "x^2" }, { kind: "text", value: " then " }, { kind: "display", value: "y=1" }, { kind: "text", value: " ok" },
    ]);
  });
  it("leaves dollars and unclosed delimiters alone", () => {
    assert.deepEqual(splitMath("costs $5 and $6 \\(open"), [{ kind: "text", value: "costs $5 and $6 \\(open" }]);
  });
  it("makes a plain one-line title", () => assert.equal(plainMath("Find \\(x^2\\)"), "Find x^2"));
});

import { clipMath } from "./math";
describe("clipMath", () => {
  it("never leaves a formula open", () => {
    assert.equal(clipMath("ab \\(x^2 + y^2 = z^2\\)", 8), "ab…");
    assert.equal(clipMath("short", 50), "short");
  });
});
