import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "@/lib/db";
import { createDocument } from "@/lib/documents/repo";
import { closeTestDb, installTestDb, makeTempDir } from "@/lib/testing/test-db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { GET } from "./route";

/*
 * The route is called with a plain Request, as Next does. Without a session
 * cookie it must refuse; with one it serves the bytes as a download.
 */

const PASSWORD = "test-only-password-not-real";
const SECRET = "test-only-session-secret-0123456789abcdef";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const META = { title: "Scan", category: "Other", tags: null, issued_on: null, expires_on: null, notes: null };

const ENV_KEYS = ["TRACK_PASSWORD", "TRACK_SESSION_SECRET", "TRACK_FILES_DIR", "TRACK_SESSION_EPOCH"] as const;
const saved: Record<string, string | undefined> = {};
let filesDirPath: string;

async function cookieHeader(): Promise<string> {
  const token = await createSessionToken(process.env);
  assert.ok(token, "test session token should be created");
  return `${SESSION_COOKIE}=${token}`;
}

function request(id: string, cookie?: string): { req: Request; ctx: { params: Promise<{ id: string }> } } {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return {
    req: new Request(`http://localhost/api/documents/${id}/file`, { headers }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

describe("GET /api/documents/[id]/file", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    process.env.TRACK_PASSWORD = PASSWORD;
    process.env.TRACK_SESSION_SECRET = SECRET;
    delete process.env.TRACK_SESSION_EPOCH;
    filesDirPath = makeTempDir("track-route-files-");
    process.env.TRACK_FILES_DIR = filesDirPath;
    installTestDb();
  });

  afterEach(() => {
    closeTestDb();
    fs.rmSync(filesDirPath, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("refuses a request with no session cookie, with no-store and nosniff", async () => {
    const id = await createDocument(META, { displayName: "scan.png", mime: "image/png", bytes: PNG });
    const { req, ctx } = request(String(id));
    const response = await GET(req, ctx);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await response.json(), { error: "Unauthorized." });
  });

  it("refuses a forged or wrong-secret cookie", async () => {
    const id = await createDocument(META, { displayName: "scan.png", mime: "image/png", bytes: PNG });
    const forged = `${SESSION_COOKIE}=v2.0.${Date.now() + 60_000}.${"a".repeat(64)}`;
    const { req, ctx } = request(String(id), forged);
    assert.equal((await GET(req, ctx)).status, 401);
  });

  it("serves the stored bytes as an attachment to a signed-in request", async () => {
    const id = await createDocument(META, { displayName: "passport scan.png", mime: "image/png", bytes: PNG });
    const { req, ctx } = request(String(id), await cookieHeader());
    const response = await GET(req, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-length"), String(PNG.byteLength));
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.ok(disposition.startsWith("attachment;"), disposition);
    assert.ok(disposition.includes('filename="passport scan.png"'));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
  });

  it("falls back to a generic type for a stored MIME the allowlist does not hold", async () => {
    const id = await createDocument(META, { displayName: "x.png", mime: "image/png", bytes: PNG });
    getDb().prepare("UPDATE documents SET file_mime = ? WHERE id = ?").run("text/html", id);
    const { req, ctx } = request(String(id), await cookieHeader());
    const response = await GET(req, ctx);
    assert.equal(response.headers.get("content-type"), "application/octet-stream");
  });

  it("returns 404 for a document without a file, a missing document, and malformed ids", async () => {
    const bare = getDb()
      .prepare("INSERT INTO documents (title) VALUES (?)")
      .run("No file") as { lastInsertRowid: number | bigint };
    const cookie = await cookieHeader();
    for (const id of [String(bare.lastInsertRowid), "9999", "../1", "1;drop", "0x1", ""]) {
      const { req, ctx } = request(id, cookie);
      const response = await GET(req, ctx);
      assert.equal(response.status, 404, `id ${JSON.stringify(id)}`);
    }
  });

  it("returns 404 when the stored file has gone missing from disk", async () => {
    const id = await createDocument(META, { displayName: "gone.png", mime: "image/png", bytes: PNG });
    const key = getDb().prepare("SELECT file_key FROM documents WHERE id = ?").get(id) as { file_key: string };
    fs.rmSync(`${filesDirPath}/${key.file_key}`);
    const { req, ctx } = request(String(id), await cookieHeader());
    assert.equal((await GET(req, ctx)).status, 404);
  });
});
