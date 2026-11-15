import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { AI_FEATURES, configuredModel } from "./config";
import type { AiConsent, AiFeature, AiStatus, ConsentScope } from "./types";

const DEFAULT_SCOPE: ConsentScope = { allowDailyCycle: false, maxExcerptChars: 280 };
const MIN_EXCERPT_CHARS = 40;
const MAX_EXCERPT_CHARS = 2_000;

export class AiPolicyError extends Error {
  constructor(
    readonly code: "not_configured" | "disabled" | "no_consent",
    message: string,
  ) {
    super(message);
    this.name = "AiPolicyError";
  }
}

function assertFeature(feature: AiFeature): void {
  if (!(AI_FEATURES as readonly string[]).includes(feature))
    throw new Error("Unsupported AI feature.");
}

function normalizeScope(scope: Partial<ConsentScope> | null | undefined): ConsentScope {
  const requested = scope?.maxExcerptChars;
  const maxExcerptChars =
    typeof requested === "number" && Number.isFinite(requested)
      ? Math.max(MIN_EXCERPT_CHARS, Math.min(MAX_EXCERPT_CHARS, Math.floor(requested)))
      : DEFAULT_SCOPE.maxExcerptChars;
  return {
    allowDailyCycle:
      typeof scope?.allowDailyCycle === "boolean" ? scope.allowDailyCycle : DEFAULT_SCOPE.allowDailyCycle,
    maxExcerptChars,
  };
}

function readScope(value: string | null | undefined): ConsentScope {
  if (!value) return { ...DEFAULT_SCOPE };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SCOPE };
    return normalizeScope(parsed as Partial<ConsentScope>);
  } catch {
    return { ...DEFAULT_SCOPE };
  }
}

export function getConsent(db: DatabaseSync, feature: AiFeature): AiConsent {
  assertFeature(feature);
  const row = db
    .prepare(
      `SELECT enabled, provider, model, granted_at, revoked_at, scope_json
       FROM ai_consent WHERE feature = ?`,
    )
    .get(feature) as
    | {
        enabled: number;
        provider: string;
        model: string | null;
        granted_at: string | null;
        revoked_at: string | null;
        scope_json: string | null;
      }
    | undefined;
  if (!row) {
    return {
      feature,
      enabled: false,
      provider: "openrouter",
      model: null,
      grantedAt: null,
      revokedAt: null,
      scope: { ...DEFAULT_SCOPE },
    };
  }
  return {
    feature,
    enabled: row.enabled === 1,
    provider: "openrouter",
    model: row.model,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    scope: readScope(row.scope_json),
  };
}

export function setConsent(
  db: DatabaseSync,
  feature: AiFeature,
  enabled: boolean,
  scope?: Partial<ConsentScope>,
): AiConsent {
  assertFeature(feature);
  if (typeof enabled !== "boolean") throw new TypeError("AI consent must be enabled or disabled.");
  const current = getConsent(db, feature);
  const nextScope = normalizeScope({ ...current.scope, ...scope });
  const at = new Date().toISOString();
  const grantedAt = enabled ? at : current.grantedAt;
  const revokedAt = enabled ? null : at;
  const model = enabled ? configuredModel() : current.model;
  db.prepare(
    `INSERT INTO ai_consent
      (feature, enabled, provider, model, granted_at, revoked_at, scope_json)
     VALUES (?, ?, 'openrouter', ?, ?, ?, ?)
     ON CONFLICT(feature) DO UPDATE SET
       enabled = excluded.enabled,
       provider = excluded.provider,
       model = excluded.model,
       granted_at = excluded.granted_at,
       revoked_at = excluded.revoked_at,
       scope_json = excluded.scope_json`,
  ).run(feature, enabled ? 1 : 0, model, grantedAt, revokedAt, JSON.stringify(nextScope));
  return getConsent(db, feature);
}

function assertEnvironmentAllowed(): void {
  if (process.env.TRACK_AI_DISABLED === "1")
    throw new AiPolicyError("disabled", "AI calls are disabled by the server setting.");
  if (!process.env.OPENROUTER_API_KEY?.trim())
    throw new AiPolicyError("not_configured", "OpenRouter is not configured on this server.");
}

/** The only gate for a network call; `db` exists only for injection in tests. */
export function assertAiAllowed(
  request: { feature: AiFeature; purpose: string },
  db?: DatabaseSync,
): AiConsent {
  assertFeature(request.feature);
  assertEnvironmentAllowed();
  const consent = getConsent(db ?? getDb(), request.feature);
  if (!consent.enabled)
    throw new AiPolicyError("no_consent", "AI is off for this feature until you opt in under Settings.");
  return consent;
}

export function getAiStatus(db: DatabaseSync): AiStatus {
  return {
    keyConfigured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    killSwitch: process.env.TRACK_AI_DISABLED === "1",
    defaultModel: configuredModel(),
    consents: AI_FEATURES.map((feature) => getConsent(db, feature)),
  };
}
