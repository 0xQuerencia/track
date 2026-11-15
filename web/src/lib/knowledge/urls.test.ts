import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeHttpUrl, urlLabel } from "./urls";

describe("safeHttpUrl", () => {
  it("accepts http and https addresses and normalizes them", () => {
    assert.equal(safeHttpUrl(" https://Example.com/a?b=1 "), "https://example.com/a?b=1");
    assert.equal(safeHttpUrl("http://example.org"), "http://example.org/");
  });

  it("rejects other schemes, relative paths and garbage", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,hi", "ftp://x.example", "/relative", "example.com", "", "not a url"]) {
      assert.equal(safeHttpUrl(value), null, value);
    }
  });

  it("rejects embedded credentials, control characters and oversize input", () => {
    assert.equal(safeHttpUrl("https://user:pass@example.com/"), null);
    assert.equal(safeHttpUrl("https://example.com/\nx"), null);
    assert.equal(safeHttpUrl(`https://example.com/${"a".repeat(2100)}`), null);
  });

  it("gives a short label without the scheme", () => {
    assert.equal(urlLabel("https://docs.example.com/guide/start"), "docs.example.com/guide/start");
    assert.equal(urlLabel("https://example.com/"), "example.com");
  });
});
