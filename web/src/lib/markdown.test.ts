import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { markdownNodes, safeMarkdownHref } from "./markdown";

const html = (source: string | null): string =>
  renderToStaticMarkup(createElement("div", null, markdownNodes(source)));

describe("safe markdown: unsafe input", () => {
  it("never emits a raw script tag, even when typed in full", () => {
    const out = html('<script>alert("x")</script>');
    assert.ok(!out.includes("<script"), out);
    assert.ok(out.includes("&lt;script&gt;"), "shown as escaped text");
  });

  it("does not turn an onerror attribute into a live handler", () => {
    const out = html('<img src=x onerror="alert(1)">');
    assert.ok(!/<img/i.test(out), out);
    assert.ok(!/<[^>]*onerror/i.test(out), out);
  });

  it("drops javascript: links and keeps only their label", () => {
    const out = html("[click me](javascript:alert(1))");
    assert.ok(!/href=/.test(out), out);
    assert.ok(!/javascript:/i.test(out), out);
    assert.ok(out.includes("click me"));
  });

  it("drops mixed-case and whitespace-padded javascript: targets", () => {
    for (const target of ["JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)"]) {
      const out = html(`[x](${target})`);
      assert.ok(!/href=/i.test(out), `${target} -> ${out}`);
    }
  });

  it("drops data: and relative targets", () => {
    assert.ok(!/href=/.test(html("[x](data:text/html,<b>hi</b>)")));
    assert.ok(!/href=/.test(html("[x](/knowledge/1)")));
  });

  it("does not parse raw HTML inside emphasis or code", () => {
    const out = html("**<img src=x onerror=alert(1)>** and `<script>`");
    assert.ok(!/<img/i.test(out) && !/<script/i.test(out), out);
    assert.ok(out.includes("&lt;script&gt;"));
  });

  it("treats a javascript: autolink as text, not a link", () => {
    const out = html("javascript://evil.example/%0aalert(1)");
    assert.ok(!/href=/.test(out), out);
  });
});

describe("safe markdown: links", () => {
  it("allows http, https and mailto with hardened rel attributes", () => {
    const out = html("[a](https://example.com/x) [b](http://example.org) [c](mailto:me@example.com)");
    assert.equal((out.match(/rel="noopener noreferrer nofollow"/g) ?? []).length, 3);
    assert.ok(out.includes('href="https://example.com/x"'));
    assert.ok(out.includes('href="mailto:me@example.com"'));
  });

  it("autolinks bare https URLs and trims trailing punctuation", () => {
    const out = html("See https://example.com/page.");
    assert.ok(out.includes('href="https://example.com/page"'), out);
    assert.ok(out.includes("https://example.com/page</a>."), out);
  });

  it("safeMarkdownHref accepts only the three allowed schemes", () => {
    assert.equal(safeMarkdownHref("https://a.example/"), "https://a.example/");
    assert.equal(safeMarkdownHref("mailto:x@y.example"), "mailto:x@y.example");
    assert.equal(safeMarkdownHref("javascript:alert(1)"), null);
    assert.equal(safeMarkdownHref("ftp://files.example"), null);
    assert.equal(safeMarkdownHref("https://a b.example"), null);
    assert.equal(safeMarkdownHref(""), null);
  });
});

describe("markdown rendering", () => {
  it("renders headings, emphasis and inline code", () => {
    const out = html("# Title\n\nSome **bold**, *italic* and `code`.");
    assert.ok(out.includes("<h1>Title</h1>"), out);
    assert.ok(out.includes("<strong>bold</strong>"));
    assert.ok(out.includes("<em>italic</em>"));
    assert.ok(out.includes("<code>code</code>"));
  });

  it("does not italicise snake_case words", () => {
    const out = html("use my_var_name here");
    assert.ok(!out.includes("<em>"), out);
  });

  it("renders fenced code literally, without interpreting markup inside", () => {
    const out = html("```js\nconst a = '<b>x</b>';\n```");
    assert.ok(out.includes('class="language-js"'), out);
    assert.ok(out.includes("&lt;b&gt;x&lt;/b&gt;"), out);
    assert.ok(!out.includes("<b>x</b>"));
  });

  it("renders unordered, ordered and task lists, with read-only checkboxes", () => {
    const out = html("- one\n- two\n\n1. first\n2. second\n\n- [ ] open\n- [x] done");
    assert.ok(out.includes("<ul"), out);
    assert.ok(out.includes("<ol"), out);
    assert.ok(out.includes('type="checkbox"'), out);
    assert.ok(out.includes("disabled"));
    assert.ok(/checked=""/.test(out), "done task is checked");
  });

  it("renders blockquotes and horizontal rules", () => {
    const out = html("> quoted **text**\n\n---");
    assert.ok(out.includes("<blockquote>"), out);
    assert.ok(out.includes("<strong>text</strong>"));
    assert.ok(out.includes("<hr"), out);
  });

  it("keeps unmatched markers as text and handles empty input", () => {
    assert.equal(html("a * b"), "<div><p>a * b</p></div>");
    assert.equal(html(""), "<div></div>");
    assert.equal(html(null), "<div></div>");
  });

  it("truncates very long sources instead of rendering all of them", () => {
    const out = html("x".repeat(150_000));
    assert.ok(out.length < 120_000);
  });
});
