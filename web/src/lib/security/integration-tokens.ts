/**
 * Scoped integration tokens (server-only). A token looks like
 * `trk_<43 base64url chars>` (32 random bytes). Only its SHA-256 hash is
 * stored, so a database leak does not reveal usable tokens.
 *
 * This module does not create the table or wire any route. The caller applies
 * INTEGRATION_TOKENS_SQL (owned by the schema/migration work) and passes the
 * DatabaseSync handle in, which keeps every function testable against an
 * in-memory database.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const INTEGRATION_SCOPES = [
  "sessions:write",
  "projects:write",
  "metadata:write",
  "dreamer:run",
  "study:jobs",
  "activity:write",
  "activity:maintenance",
  "focus:read",
  "study-nanny:write",
] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export const TOKEN_PREFIX = "trk_";
const TOKEN_PATTERN = /^trk_[A-Za-z0-9_-]{43}$/;
const MAX_LABEL_LENGTH = 80;

/** Schema for the token table. Apply via the migration layer, not here. */
export const INTEGRATION_TOKENS_SQL = `CREATE TABLE IF NOT EXISTS integration_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
)`;

export type CreatedToken = {
  id: number;
  /** Shown once at creation. It is not stored and cannot be recovered. */
  token: string;
  label: string;
  scopes: IntegrationScope[];
};

export type VerifyResult =
  | { ok: true; id: number; label: string; scopes: IntegrationScope[] }
  | { ok: false; reason: "invalid" | "revoked" | "scope" };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Extracts the raw token from an Authorization header value, if present. */
export function tokenFromAuthorization(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

function normaliseScopes(scopes: readonly string[]): IntegrationScope[] {
  const allowed = new Set<string>(INTEGRATION_SCOPES);
  const unique = [...new Set(scopes)];
  if (unique.length === 0) throw new RangeError("A token needs at least one scope");
  for (const scope of unique)
    if (!allowed.has(scope)) throw new RangeError(`Unknown scope: ${scope}`);
  return INTEGRATION_SCOPES.filter((scope) => unique.includes(scope));
}

function parseScopes(raw: unknown): IntegrationScope[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normaliseScopes(parsed.filter((s): s is string => typeof s === "string"));
  } catch {
    return [];
  }
}

export function createToken(
  db: DatabaseSync,
  label: string,
  scopes: readonly IntegrationScope[],
): CreatedToken {
  const cleanLabel = label.trim();
  if (!cleanLabel || cleanLabel.length > MAX_LABEL_LENGTH)
    throw new RangeError(`Label must be 1-${MAX_LABEL_LENGTH} characters`);
  const normalised = normaliseScopes(scopes);
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const result = db
    .prepare(
      "INSERT INTO integration_tokens (label, token_hash, scopes) VALUES (?, ?, ?)",
    )
    .run(cleanLabel, hashToken(token), JSON.stringify(normalised));
  return {
    id: Number(result.lastInsertRowid),
    token,
    label: cleanLabel,
    scopes: normalised,
  };
}

/**
 * Checks a raw bearer token against the stored hash and required scope.
 * Records last_used_at on success. Malformed input is rejected before any
 * database access.
 */
export function verifyToken(
  db: DatabaseSync,
  bearer: string | null | undefined,
  requiredScope: IntegrationScope,
): VerifyResult {
  if (!bearer || !TOKEN_PATTERN.test(bearer)) return { ok: false, reason: "invalid" };

  const hash = hashToken(bearer);
  const row = db
    .prepare(
      "SELECT id, label, token_hash, scopes, revoked_at FROM integration_tokens WHERE token_hash = ?",
    )
    .get(hash);
  if (!row) return { ok: false, reason: "invalid" };

  const storedHash = String(row.token_hash ?? "");
  const hashesMatch =
    storedHash.length === hash.length &&
    timingSafeEqual(Buffer.from(storedHash), Buffer.from(hash));
  if (!hashesMatch) return { ok: false, reason: "invalid" };
  if (row.revoked_at !== null && row.revoked_at !== undefined)
    return { ok: false, reason: "revoked" };

  const scopes = parseScopes(row.scopes);
  if (!scopes.includes(requiredScope)) return { ok: false, reason: "scope" };

  const id = Number(row.id);
  db.prepare("UPDATE integration_tokens SET last_used_at = datetime('now') WHERE id = ?").run(
    id,
  );
  return { ok: true, id, label: String(row.label ?? ""), scopes };
}

/** Revokes a token by id. Returns false if it was missing or already revoked. */
export function revokeToken(db: DatabaseSync, id: number): boolean {
  const result = db
    .prepare(
      "UPDATE integration_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL",
    )
    .run(id);
  return Number(result.changes) > 0;
}
