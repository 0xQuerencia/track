import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { addDays, todayStr } from "../dates";
import { closeTestDb, installTestDb, makeTempDir } from "../testing/test-db";
import { getExpiringDocuments } from "./index";
import { expiryBadge } from "./expiry";
import {
  attachDocumentFile,
  createDocument,
  deleteDocument,
  removeDocumentFile,
  checksumOf,
} from "./repo";
import { getDocument, getDocumentFileInfo, listDocuments } from "./queries";
import {
  filesDir,
  isStorageKey,
  newStorageKey,
  readStoredFile,
  removeStoredFile,
  resolveStoredPath,
  writeStoredFile,
} from "./storage";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const TODAY = todayStr();

describe("storage paths", () => {
  const dir = "/srv/track-files";

  it("accepts only UUID v4 keys", () => {
    assert.equal(isStorageKey(newStorageKey()), true);
    assert.equal(isStorageKey("123e4567-e89b-42d3-a456-426614174000"), true);
    assert.equal(isStorageKey("123E4567-e89b-42d3-a456-426614174000"), false, "uppercase");
    assert.equal(isStorageKey("123e4567-e89b-12d3-a456-426614174000"), false, "not version 4");
    assert.equal(isStorageKey(undefined), false);
    assert.equal(isStorageKey(42), false);
  });

  it("refuses traversal, absolute paths and near-misses, so nothing resolves outside the directory", () => {
    const attempts = [
      "../etc/passwd",
      "../../secrets",
      "/etc/passwd",
      "..",
      ".",
      "",
      "123e4567-e89b-42d3-a456-426614174000/../x",
      "123e4567-e89b-42d3-a456-426614174000\n",
      "sub/123e4567-e89b-42d3-a456-426614174000",
    ];
    for (const attempt of attempts) assert.equal(resolveStoredPath(attempt, dir), null, attempt);
  });

  it("resolves a valid key to a file directly inside the directory", () => {
    const key = "123e4567-e89b-42d3-a456-426614174000";
    const resolved = resolveStoredPath(key, dir);
    assert.equal(resolved, path.join(path.resolve(dir), key));
  });

  it("uses TRACK_FILES_DIR when set, and data/files under the working directory otherwise", () => {
    assert.equal(filesDir({ TRACK_FILES_DIR: "/var/track" }), path.resolve("/var/track"));
    assert.equal(filesDir({}), path.join(process.cwd(), "data", "files"));
    assert.equal(filesDir({ TRACK_FILES_DIR: "   " }), path.join(process.cwd(), "data", "files"));
  });

  it("refuses a files directory inside public/, which would be served without auth", () => {
    assert.throws(() => filesDir({ TRACK_FILES_DIR: path.join(process.cwd(), "public", "x") }), /public/);
    assert.throws(() => filesDir({ TRACK_FILES_DIR: path.join(process.cwd(), "public") }), /public/);
    assert.doesNotThrow(() => filesDir({ TRACK_FILES_DIR: path.join(process.cwd(), "publication") }));
  });
});

describe("stored file lifecycle", () => {
  let dir: string;
  const previous = process.env.TRACK_FILES_DIR;

  beforeEach(() => {
    installTestDb();
    dir = makeTempDir("track-files-");
    process.env.TRACK_FILES_DIR = dir;
  });
  afterEach(() => {
    closeTestDb();
    if (previous === undefined) delete process.env.TRACK_FILES_DIR;
    else process.env.TRACK_FILES_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes an owner-only file under a fresh key and never overwrites one", async () => {
    const key = newStorageKey();
    await writeStoredFile(key, PNG_BYTES, dir);
    const target = path.join(dir, key);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    }
    assert.deepEqual(new Uint8Array(await readStoredFile(key, dir) ?? new Uint8Array()), PNG_BYTES);
    await assert.rejects(writeStoredFile(key, PNG_BYTES, dir), /EEXIST/);
  });

  it("returns null for a missing file or a malformed key, and never reads outside the directory", async () => {
    assert.equal(await readStoredFile(newStorageKey(), dir), null);
    assert.equal(await readStoredFile("../../etc/passwd", dir), null);
    await assert.rejects(writeStoredFile("../escape", PNG_BYTES, dir), /Invalid storage key/);
  });

  it("treats an already-missing file as removed, and an invalid key as not removed", async () => {
    assert.equal(await removeStoredFile(newStorageKey(), dir), true);
    assert.equal(await removeStoredFile("../../x", dir), false);
  });

  it("keeps the file and its checksum in step with the row through create, attach, detach and delete", async () => {
    const id = await createDocument(
      { title: "Passport", category: "Identity", tags: null, issued_on: null, expires_on: null, notes: null },
      { displayName: "passport.png", mime: "image/png", bytes: PNG_BYTES },
    );
    const first = getDocumentFileInfo(id);
    assert.ok(first?.file_key);
    assert.equal(fs.existsSync(path.join(dir, first.file_key)), true);
    assert.equal(getDocument(id)?.checksum, checksumOf(PNG_BYTES));
    assert.equal(getDocument(id)?.file_size, PNG_BYTES.byteLength);

    const replacement = new Uint8Array([...PNG_BYTES, 9]);
    assert.equal(
      await attachDocumentFile(id, { displayName: "scan.png", mime: "image/png", bytes: replacement }),
      true,
    );
    const second = getDocumentFileInfo(id);
    assert.ok(second?.file_key && second.file_key !== first.file_key);
    assert.equal(fs.existsSync(path.join(dir, first.file_key)), false, "old file removed");
    assert.equal(getDocument(id)?.file_name, "scan.png");

    assert.equal(await removeDocumentFile(id), true);
    assert.equal(getDocument(id)?.file_key, null);
    assert.equal(fs.existsSync(path.join(dir, second.file_key)), false);

    const attachedAgain = await attachDocumentFile(id, { displayName: "again.png", mime: "image/png", bytes: PNG_BYTES });
    assert.equal(attachedAgain, true);
    const third = getDocumentFileInfo(id)?.file_key;
    assert.ok(third);
    assert.equal(await deleteDocument(id), true);
    assert.equal(fs.existsSync(path.join(dir, third)), false, "file removed with the row");
    assert.equal(getDocument(id), null);
  });

  it("does not store a file for a document that does not exist", async () => {
    assert.equal(
      await attachDocumentFile(9999, { displayName: "x.png", mime: "image/png", bytes: PNG_BYTES }),
      false,
    );
    assert.equal(fs.readdirSync(dir).length, 0, "no orphan written");
    assert.equal(await removeDocumentFile(9999), false);
    assert.equal(await deleteDocument(9999), false);
  });

  it("refuses a tampered file_key written through a generic path, at the database level", () => {
    assert.throws(() =>
      getDb()
        .prepare("INSERT INTO documents (title, file_key) VALUES (?, ?)")
        .run("Tampered", "../../etc/passwd"),
    );
  });

  it("filters documents by search text, category and expiry without interpolating input", async () => {
    await createDocument(
      { title: "Renew licence", category: "Identity", tags: "travel", issued_on: null, expires_on: addDays(TODAY, 10), notes: null },
      null,
    );
    await createDocument(
      { title: "Old receipt", category: "Receipts", tags: null, issued_on: null, expires_on: addDays(TODAY, -3), notes: null },
      null,
    );
    await createDocument(
      { title: "Forever", category: "Other", tags: null, issued_on: null, expires_on: null, notes: null },
      null,
    );

    assert.deepEqual(
      listDocuments({ q: "", category: "", expiry: "attention" }, 1, TODAY).rows.map((r) => r.title),
      ["Old receipt", "Renew licence"],
    );
    assert.deepEqual(
      listDocuments({ q: "", category: "", expiry: "expired" }, 1, TODAY).rows.map((r) => r.title),
      ["Old receipt"],
    );
    assert.deepEqual(
      listDocuments({ q: "travel", category: "", expiry: "all" }, 1, TODAY).rows.map((r) => r.title),
      ["Renew licence"],
    );
    assert.equal(listDocuments({ q: "%", category: "", expiry: "all" }, 1, TODAY).total, 0);
    assert.equal(listDocuments({ q: "", category: "Identity", expiry: "all" }, 1, TODAY).total, 1);
  });
});

describe("expiry reminders", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("labels expired, soon and far-off expiry dates", () => {
    assert.equal(expiryBadge("2000-01-01", TODAY)?.tone, "expired");
    assert.equal(expiryBadge(TODAY, TODAY)?.label, "Expires today");
    assert.equal(expiryBadge(addDays(TODAY, 5), TODAY)?.tone, "soon");
    assert.equal(expiryBadge(addDays(TODAY, 400), TODAY)?.tone, "ok");
    assert.equal(expiryBadge(null, TODAY), null);
  });

  it("exports documents expiring within the window plus already-expired ones, soonest first", async () => {
    const meta = { category: "Other", tags: null, issued_on: null, notes: null };
    await createDocument({ ...meta, title: "Far", expires_on: addDays(TODAY, 200) }, null);
    await createDocument({ ...meta, title: "Soon", expires_on: addDays(TODAY, 20) }, null);
    await createDocument({ ...meta, title: "Expired", expires_on: addDays(TODAY, -30) }, null);
    await createDocument({ ...meta, title: "Never", expires_on: null }, null);

    const items = getExpiringDocuments(60);
    assert.deepEqual(items.map((i) => i.title), ["Expired", "Soon"]);
    assert.equal(items[0].expired, true);
    assert.equal(items[1].daysLeft, 20);
    assert.equal(items[1].href, `/documents/${items[1].id}`);

    const wide = getExpiringDocuments(365);
    assert.equal(wide.length, 3);
    assert.deepEqual(getExpiringDocuments(-5).map((i) => i.title), ["Expired"]);
  });
});
