import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureSchema, ideaSchema } from "./schema";
import { parseIdeaParams } from "./filters";

const validIdea = {
  title: "  Smart plant pots  ",
  body: "",
  category: "Hardware",
  status: "Exploring",
  priority: "High",
  tags: "iot, plants, iot",
  research_links: "",
  attachments: "",
  notes: "",
};

describe("idea input rules", () => {
  it("requires a title for quick capture and trims it", () => {
    assert.equal(captureSchema.safeParse({ title: "   " }).success, false);
    assert.equal(captureSchema.parse({ title: " Idea " }).title, "Idea");
  });

  it("accepts a valid idea and normalises tags and empty text", () => {
    const parsed = ideaSchema.parse(validIdea);
    assert.equal(parsed.title, "Smart plant pots");
    assert.equal(parsed.body, null);
    assert.equal(parsed.tags, "iot, plants");
    assert.equal(parsed.research_links, null);
    assert.equal(parsed.notes, null);
  });

  it("rejects categories, statuses and priorities outside the lists", () => {
    assert.equal(ideaSchema.safeParse({ ...validIdea, category: "Cooking" }).success, false);
    assert.equal(ideaSchema.safeParse({ ...validIdea, status: "Done" }).success, false);
    assert.equal(ideaSchema.safeParse({ ...validIdea, priority: "Urgent" }).success, false);
  });

  it("accepts only http(s) research links, one per line", () => {
    const ok = ideaSchema.parse({ ...validIdea, research_links: "https://a.example/x\n  http://b.example  \n\n" });
    assert.equal(ok.research_links, "https://a.example/x\nhttp://b.example/");
    const bad = ideaSchema.safeParse({ ...validIdea, research_links: "https://a.example\njavascript:alert(1)" });
    assert.equal(bad.success, false);
  });

  it("caps the number of research links and attachment lines", () => {
    const many = Array.from({ length: 31 }, (_, i) => `https://a.example/${i}`).join("\n");
    assert.equal(ideaSchema.safeParse({ ...validIdea, research_links: many }).success, false);
    const attachments = Array.from({ length: 31 }, (_, i) => `file ${i}`).join("\n");
    assert.equal(ideaSchema.safeParse({ ...validIdea, attachments }).success, false);
  });

  it("keeps attachments as plain reference lines, stripping control characters", () => {
    const parsed = ideaSchema.parse({ ...validIdea, attachments: "  sketch.pdf \u0007\nwiring diagram " });
    assert.equal(parsed.attachments, "sketch.pdf\nwiring diagram");
  });
});

describe("idea list URL state", () => {
  it("defaults to active ideas in card view, page 1", () => {
    const parsed = parseIdeaParams({});
    assert.deepEqual(parsed.filters, {
      q: "",
      status: null,
      category: null,
      tag: null,
      pinned: false,
      archived: "active",
    });
    assert.equal(parsed.view, "cards");
    assert.equal(parsed.page, 1);
  });

  it("drops unknown statuses, categories, views and archived modes", () => {
    const parsed = parseIdeaParams({
      status: "Done; DROP TABLE ideas",
      category: "Linux",
      view: "grid",
      archived: "everything",
      pinned: "1",
      page: "3",
      tag: "  ai  ",
    });
    assert.equal(parsed.filters.status, null);
    assert.equal(parsed.filters.category, "Linux");
    assert.equal(parsed.filters.archived, "active");
    assert.equal(parsed.filters.pinned, true);
    assert.equal(parsed.filters.tag, "ai");
    assert.equal(parsed.view, "cards");
    assert.equal(parsed.page, 3);
  });

  it("reads repeated params by their first value and rejects bad page numbers", () => {
    const parsed = parseIdeaParams({ q: ["first", "second"], page: "-4" });
    assert.equal(parsed.filters.q, "first");
    assert.equal(parsed.page, 1);
  });
});
