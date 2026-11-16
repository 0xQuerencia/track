import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanExternalId, cleanText, parseTimestamp, sanitizeResumeCommand } from "./sanitize";

describe("cleanText", () => {
  it("strips control characters and trims", () => {
    assert.equal(cleanText("  hi\u0000\u0007there  ", 50), "hithere");
  });

  it("turns line breaks into spaces for single-line fields", () => {
    assert.equal(cleanText("a\nb\tc", 50), "a b c");
  });

  it("keeps line breaks for multiline fields", () => {
    assert.equal(cleanText("a\r\nb", 50, true), "a\nb");
  });

  it("caps length by code point, not splitting surrogate pairs", () => {
    assert.equal(cleanText("😀😀😀", 2), "😀😀");
  });

  it("returns null for non-strings and blank values", () => {
    assert.equal(cleanText(42, 10), null);
    assert.equal(cleanText("   \u0000  ", 10), null);
  });
});

describe("parseTimestamp", () => {
  it("returns UTC ISO text", () => {
    assert.equal(parseTimestamp("2026-11-15T09:00:00+05:30"), "2026-11-15T03:30:00.000Z");
  });

  it("returns null for unparseable input", () => {
    assert.equal(parseTimestamp("not a date"), null);
    assert.equal(parseTimestamp(null), null);
  });
});

describe("cleanExternalId", () => {
  it("accepts ids made of safe characters", () => {
    assert.equal(cleanExternalId("123e4567-e89b-12d3-a456-426614174000"), "123e4567-e89b-12d3-a456-426614174000");
    assert.equal(cleanExternalId("ses_01HX"), "ses_01HX");
  });

  it("rejects ids that start with a symbol or contain spaces and shell characters", () => {
    assert.equal(cleanExternalId("-rf"), null);
    assert.equal(cleanExternalId("a b"), null);
    assert.equal(cleanExternalId("a;rm"), null);
    assert.equal(cleanExternalId(""), null);
  });
});

describe("sanitizeResumeCommand", () => {
  const accepted = [
    "claude --resume 123e4567-e89b-12d3-a456-426614174000",
    "codex resume 0193f2a1-7c3b",
    "opencode --session ses_01HX",
    "cd /home/you/code/app && claude --resume abc-123",
    "cd ~/code/app && codex resume abc",
  ];
  for (const value of accepted)
    it(`accepts ${JSON.stringify(value)}`, () => {
      assert.equal(sanitizeResumeCommand(value), value);
    });

  const rejected = [
    "claude --resume $(rm -rf ~)",
    "claude --resume abc; rm -rf ~",
    "claude --resume abc && rm -rf ~",
    "claude --resume `id`",
    "claude --resume --dangerously-skip-permissions",
    "claude --resume ",
    "bash -c 'claude --resume abc'",
    "cd /tmp; claude --resume abc",
    "cd /tmp && bash",
    "cd -P /tmp && claude --resume abc",
    "claude --resume abc\nrm -rf ~",
    "claude --resume abc\u0000",
    "claude  --resume abc",
    "cd /home/you/My Projects && claude --resume abc",
  ];
  for (const value of rejected)
    it(`drops ${JSON.stringify(value)}`, () => {
      assert.equal(sanitizeResumeCommand(value), null);
    });

  it("drops values over the length cap and non-strings", () => {
    assert.equal(sanitizeResumeCommand(`claude --resume ${"a".repeat(400)}`), null);
    assert.equal(sanitizeResumeCommand(["claude --resume abc"]), null);
    assert.equal(sanitizeResumeCommand(undefined), null);
  });
});
