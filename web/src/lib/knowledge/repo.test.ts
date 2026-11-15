import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { searchAll } from "../crud";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { bookmarkSchema, collectionSchema, noteSchema } from "./schemas";
import {
  createBookmark,
  createCollection,
  createNote,
  deleteBookmark,
  deleteCollection,
  deleteNote,
  setBookmarkPinned,
  setNotePinned,
  updateBookmark,
  updateCollection,
  updateNote,
} from "./repo";
import { getNote, listBookmarks, listCollections, listNotes, collectionOptions, noteTags } from "./queries";
import { addLink, listLinks } from "../links";
import type { NoteFilters } from "./queries";

const noteFilters = (over: Partial<NoteFilters>): NoteFilters => ({ q: "", kind: null, tag: null, collection: null, sort: "recent", ...over });

const note = (title: string, body: string | null = null, extra: Record<string, unknown> = {}) =>
  noteSchema.parse({ title, kind: "Note", collection_id: "", tags: "", pinned: false, body: body ?? "", ...extra });

const mentionTargets = (id: number) =>
  listLinks("notes", id)
    .filter((link) => link.direction === "out" && link.relation === "mentions")
    .map((link) => link.recordId)
    .sort();

describe("notes", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates, reads, updates and deletes a note, with a fresh updated_at on edit", () => {
    const id = createNote(note("First", "Hello"));
    assert.equal(getNote(id)?.title, "First");
    assert.equal(updateNote(id, note("Renamed", "Hello again")), true);
    assert.equal(getNote(id)?.title, "Renamed");
    assert.equal(getNote(id)?.body, "Hello again");
    assert.equal(updateNote(999_999, note("Nope")), false);
    deleteNote(id);
    assert.equal(getNote(id), undefined);
  });

  it("validates kind and rejects an empty title before reaching the database", () => {
    assert.equal(noteSchema.safeParse({ title: " ", kind: "Note", collection_id: "", tags: "", pinned: false, body: "" }).success, false);
    assert.equal(noteSchema.safeParse({ title: "x", kind: "Diary", collection_id: "", tags: "", pinned: false, body: "" }).success, false);
  });

  it("keeps pinned notes first, then recently edited, and supports title sort", () => {
    const a = createNote(note("Charlie"));
    const b = createNote(note("Alpha"));
    const c = createNote(note("Bravo"));
    setNotePinned(c, true);
    getDb().prepare("UPDATE notes SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(a);
    getDb().prepare("UPDATE notes SET updated_at = '2024-01-01 00:00:00' WHERE id = ?").run(b);
    assert.deepEqual(listNotes(noteFilters({}), 1).rows.map((row) => row.id), [c, b, a]);
    assert.deepEqual(listNotes(noteFilters({ sort: "title" }), 1).rows.map((row) => row.title), ["Bravo", "Alpha", "Charlie"]);
  });

  it("filters notes by kind, collection and exact tag", () => {
    const collection = createCollection(collectionSchema.parse({ name: "Physics", description: "" }));
    createNote(noteSchema.parse({ title: "Ref card", kind: "Reference", collection_id: String(collection), tags: "optics, lenses", pinned: false, body: "" }));
    createNote(noteSchema.parse({ title: "Snippet", kind: "Snippet", collection_id: "", tags: "optics-lab", pinned: false, body: "" }));
    const titles = (q: Parameters<typeof noteFilters>[0]) => listNotes(noteFilters(q), 1).rows.map((row) => row.title).sort();
    assert.deepEqual(titles({ kind: "Reference" }), ["Ref card"]);
    assert.deepEqual(titles({ collection: collection }), ["Ref card"]);
    assert.deepEqual(titles({ tag: "optics" }), ["Ref card"], "exact tag only");
    assert.deepEqual(titles({ tag: "lenses" }), ["Ref card"]);
    assert.deepEqual(titles({ q: "Snippet" }), ["Snippet"]);
    assert.deepEqual(noteTags().map((row) => row.tag).sort(), ["lenses", "optics", "optics-lab"]);
  });

  it("is findable through universal search at its detail route", () => {
    const id = createNote(note("Quark glossary"));
    const hit = searchAll("quark").find((candidate) => candidate.entity === "notes");
    assert.equal(hit?.href, `/knowledge/${id}`);
  });

  it("drops a note's own links when it is deleted", () => {
    const a = createNote(note("Source", "See [[note:0]]"));
    const b = createNote(note("Target"));
    updateNote(a, note("Source", `See [[Target]]`));
    assert.equal(listLinks("notes", b).length, 1);
    deleteNote(a);
    assert.equal(listLinks("notes", b).length, 0);
  });
});

describe("wiki-link backlinks", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates mention links for [[Title]] and [[note:ID]] references on save", () => {
    const target = createNote(note("Quantum notes"));
    const other = createNote(note("Other"));
    const source = createNote(note("Source", `Read [[quantum notes]] and [[note:${other}]].`));
    assert.deepEqual(mentionTargets(source), [String(target), String(other)].sort());
    const backlinks = listLinks("notes", target).filter((link) => link.direction === "in");
    assert.equal(backlinks.length, 1);
    assert.equal(backlinks[0].relation, "mentions");
    assert.equal(backlinks[0].recordId, String(source));
  });

  it("removes stale mention links when a reference is taken out, and adds new ones", () => {
    const first = createNote(note("First"));
    const second = createNote(note("Second"));
    const source = createNote(note("Source", "[[First]]"));
    assert.deepEqual(mentionTargets(source), [String(first)]);
    updateNote(source, note("Source", "[[Second]]"));
    assert.deepEqual(mentionTargets(source), [String(second)]);
    assert.equal(listLinks("notes", first).filter((link) => link.direction === "in").length, 0);
  });

  it("keeps links that are not mentions, and never removes them on save", () => {
    const a = createNote(note("A"));
    const b = createNote(note("B"));
    addLink({ from: { type: "notes", id: String(a) }, to: { type: "notes", id: String(b) }, relation: "related" });
    updateNote(a, note("A", "no references now"));
    assert.equal(listLinks("notes", a).filter((link) => link.relation === "related").length, 1);
  });

  it("does not link a note to itself and ignores unknown targets", () => {
    const self = createNote(note("Loop", "[[Loop]] [[note:999999]] [[Missing title]]"));
    assert.deepEqual(mentionTargets(self), []);
  });

  it("links to the most recently edited note when two share a title", () => {
    const older = createNote(note("Shared name"));
    const newer = createNote(note("Shared name"));
    getDb().prepare("UPDATE notes SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run(older);
    getDb().prepare("UPDATE notes SET updated_at = '2025-01-01 00:00:00' WHERE id = ?").run(newer);
    const source = createNote(note("Ref", "[[shared name]]"));
    assert.deepEqual(mentionTargets(source), [String(newer)]);
  });
});

describe("bookmarks and collections", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("accepts only http(s) bookmarks and defaults the title to the address", () => {
    assert.equal(bookmarkSchema.safeParse({ url: "javascript:alert(1)", title: "", description: "", tags: "", collection_id: "", pinned: false }).success, false);
    assert.equal(bookmarkSchema.safeParse({ url: "file:///etc/passwd", title: "", description: "", tags: "", collection_id: "", pinned: false }).success, false);
    const parsed = bookmarkSchema.parse({ url: "https://docs.example.com/guide", title: "", description: "", tags: "dev, docs", collection_id: "", pinned: false });
    const id = createBookmark(parsed);
    const row = listBookmarks({ q: "", tag: null, collection: null }, 1).rows.find((r) => r.id === id);
    assert.equal(row?.title, "docs.example.com/guide");
    assert.equal(row?.tags, "dev, docs");
  });

  it("updates and pins a bookmark, and deletes it", () => {
    const id = createBookmark(bookmarkSchema.parse({ url: "https://a.example/", title: "A", description: "", tags: "", collection_id: "", pinned: false }));
    assert.equal(updateBookmark(id, bookmarkSchema.parse({ url: "https://b.example/", title: "B", description: "", tags: "", collection_id: "", pinned: false })), true);
    assert.equal(setBookmarkPinned(id, true), true);
    const pinned = listBookmarks({ q: "", tag: null, collection: null }, 1).rows[0];
    assert.equal(pinned.pinned, 1);
    assert.equal(pinned.url, "https://b.example/");
    deleteBookmark(id);
    assert.equal(listBookmarks({ q: "", tag: null, collection: null }, 1).rows.length, 0);
  });

  it("deleting a collection unfiles its notes and bookmarks but keeps them", () => {
    const collection = createCollection(collectionSchema.parse({ name: "Temp", description: "x" }));
    const noteId = createNote(noteSchema.parse({ title: "Kept", kind: "Note", collection_id: String(collection), tags: "", pinned: false, body: "" }));
    const bookmarkId = createBookmark(bookmarkSchema.parse({ url: "https://keep.example/", title: "", description: "", tags: "", collection_id: String(collection), pinned: false }));
    assert.equal(deleteCollection(collection), true);
    assert.equal(getNote(noteId)?.collection_id, null);
    assert.ok(getDb().prepare("SELECT id FROM bookmarks WHERE id = ? AND collection_id IS NULL").get(bookmarkId));
    assert.equal(collectionOptions().length, 0);
  });

  it("refuses a collection id that does not exist, storing none instead", () => {
    const id = createNote(noteSchema.parse({ title: "Orphan", kind: "Note", collection_id: "424242", tags: "", pinned: false, body: "" }));
    assert.equal(getNote(id)?.collection_id, null);
  });

  it("renames a collection and reports note and bookmark counts", () => {
    const collection = createCollection(collectionSchema.parse({ name: "Old", description: "" }));
    assert.equal(updateCollection(collection, collectionSchema.parse({ name: "New", description: "d" })), true);
    createNote(noteSchema.parse({ title: "N", kind: "Note", collection_id: String(collection), tags: "", pinned: false, body: "" }));
    createBookmark(bookmarkSchema.parse({ url: "https://x.example/", title: "", description: "", tags: "", collection_id: String(collection), pinned: false }));
    const row = listCollections("", 1).rows[0];
    assert.equal(row.name, "New");
    assert.equal(row.note_count, 1);
    assert.equal(row.bookmark_count, 1);
  });

  it("rejects an empty collection name", () => {
    assert.equal(collectionSchema.safeParse({ name: "  ", description: "" }).success, false);
  });
});

describe("knowledge pagination", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("pages notes and bookmarks with clamped page numbers and keeps pinned first", () => {
    for (let i = 0; i < 35; i++) createNote(note(`Paged ${String(i).padStart(2, "0")}`));
    createBookmark(bookmarkSchema.parse({ url: "https://p.example/", title: "Pinned bookmark", description: "", tags: "", collection_id: "", pinned: true }));
    for (let i = 0; i < 31; i++)
      createBookmark(bookmarkSchema.parse({ url: `https://p.example/${i}`, title: `B ${i}`, description: "", tags: "", collection_id: "", pinned: false }));

    const first = listNotes(noteFilters({}), 1);
    assert.equal(first.rows.length, 30);
    assert.equal(first.page.totalPages, 2);
    assert.equal(listNotes(noteFilters({}), 2).rows.length, 5);
    assert.equal(listNotes(noteFilters({}), 50).page.page, 2, "clamps past the end");

    const books = listBookmarks({ q: "", tag: null, collection: null }, 1);
    assert.equal(books.rows[0].title, "Pinned bookmark", "pinned bookmark leads");
    assert.equal(books.page.total, 32);
  });

  it("pages collections and filters them by name", () => {
    for (let i = 0; i < 3; i++) createCollection(collectionSchema.parse({ name: `Topic ${i}`, description: "" }));
    createCollection(collectionSchema.parse({ name: "Other", description: "" }));
    assert.equal(listCollections("", 1).page.total, 4);
    const matched = listCollections("topic", 1);
    assert.deepEqual(matched.rows.map((row) => row.name), ["Topic 0", "Topic 1", "Topic 2"]);
    assert.equal(collectionOptions().length, 4);
  });

  it("filters bookmarks by exact tag and collection", () => {
    const c = createCollection(collectionSchema.parse({ name: "Refs", description: "" }));
    createBookmark(bookmarkSchema.parse({ url: "https://one.example/", title: "One", description: "", tags: "docs, api", collection_id: String(c), pinned: false }));
    createBookmark(bookmarkSchema.parse({ url: "https://two.example/", title: "Two", description: "", tags: "api-extra", collection_id: "", pinned: false }));
    const byTag = listBookmarks({ q: "", tag: "api", collection: null }, 1).rows.map((row) => row.title);
    assert.deepEqual(byTag, ["One"]);
    const byCollection = listBookmarks({ q: "", tag: null, collection: c }, 1).rows.map((row) => row.title);
    assert.deepEqual(byCollection, ["One"]);
  });
});
