import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceValue, normalizeTags } from "./form";
import type { Field } from "./entities";

const markdown: Field = { name: "body", label: "Body", type: "markdown" };
const tags: Field = { name: "labels", label: "Labels", type: "tags" };
const requiredTags: Field = { ...tags, name: "topics", label: "Topics", required: true };

describe("coerceValue for markdown and tags", () => {
  it("keeps markdown text as written, trimmed, and allows it to be empty", () => {
    assert.deepEqual(coerceValue(markdown, "  # Title\n\n- item  "), {
      value: "# Title\n\n- item",
    });
    assert.deepEqual(coerceValue(markdown, "   "), { value: null });
  });

  it("normalizes tags: trims, drops empties, removes duplicates", () => {
    assert.deepEqual(coerceValue(tags, "  alpha, beta ,alpha,, "), { value: "alpha, beta" });
    assert.equal(normalizeTags(" , ,"), "");
  });

  it("caps tag count and length", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    const result = coerceValue(tags, many);
    assert.ok("value" in result);
    assert.equal((result.value as string).split(", ").length, 20);
    const long = coerceValue(tags, "x".repeat(90));
    assert.ok("value" in long && (long.value as string).length === 40);
  });

  it("requires a value when the field is required", () => {
    assert.deepEqual(coerceValue(requiredTags, " , "), { error: "Topics is required." });
  });
});
