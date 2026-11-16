import type { DatabaseSync } from "node:sqlite";
import { cleanText } from "../sessions/sanitize";
import {
  createToken,
  INTEGRATION_SCOPES,
  revokeToken,
  type IntegrationScope,
} from "../security/integration-tokens";

/*
 * Settings-page side of integration tokens. The raw token is returned exactly
 * once, from createIntegrationToken, and is never read back: listTokens only
 * returns label, scopes and timestamps.
 */

export type TokenRow = {
  id: number;
  label: string;
  scopes: IntegrationScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const LIST_LIMIT = 100;

function parseScopes(raw: string): IntegrationScope[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is IntegrationScope =>
      (INTEGRATION_SCOPES as readonly string[]).includes(String(scope)),
    );
  } catch {
    return [];
  }
}

export function listTokens(db: DatabaseSync): TokenRow[] {
  const rows = db
    .prepare(
      `SELECT id, label, scopes, created_at, last_used_at, revoked_at
       FROM integration_tokens ORDER BY id DESC LIMIT ?`,
    )
    .all(LIST_LIMIT) as {
    id: number;
    label: string;
    scopes: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }[];
  return rows.map((row) => ({
    id: Number(row.id),
    label: row.label,
    scopes: parseScopes(row.scopes),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }));
}

export type TokenCreated =
  | { ok: true; token: string; label: string; scopes: IntegrationScope[] }
  | { ok: false; error: string };

/** Validates the form and creates a token. The caller shows `token` once. */
export function createIntegrationToken(
  db: DatabaseSync,
  label: unknown,
  scopes: unknown,
): TokenCreated {
  const cleanLabel = cleanText(label, 80);
  if (!cleanLabel) return { ok: false, error: "Give the token a label of 1 to 80 characters." };
  const requested = Array.isArray(scopes)
    ? scopes.filter((scope): scope is IntegrationScope =>
        (INTEGRATION_SCOPES as readonly string[]).includes(scope as string),
      )
    : [];
  if (requested.length === 0) return { ok: false, error: "Choose at least one scope." };
  try {
    const created = createToken(db, cleanLabel, requested);
    return { ok: true, token: created.token, label: created.label, scopes: created.scopes };
  } catch {
    return { ok: false, error: "The token could not be created." };
  }
}

export function revokeIntegrationToken(db: DatabaseSync, id: unknown): boolean {
  const numeric = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return false;
  return revokeToken(db, numeric);
}
