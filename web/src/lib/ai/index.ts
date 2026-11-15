import type { DatabaseSync } from "node:sqlite";
import type {
  AiConsent,
  AiDisclosure,
  AiDisclosureItem,
  AiFeature,
  AiStatus,
  ChatJsonDeps,
  ChatJsonRequest,
  ChatJsonResult,
  ConsentScope,
} from "./types";

export type * from "./types";

/*
 * STUB owned by the AI-client agent: replace each body with the real
 * implementation (openrouter.ts, policy.ts, redact-for-ai.ts) and keep these
 * exported names and signatures stable, because Dreamer is being built against them.
 */

export async function chatJson<T>(
  _request: ChatJsonRequest<T>,
  _deps?: ChatJsonDeps,
): Promise<ChatJsonResult<T>> {
  return { ok: false, code: "not_configured", message: "AI client not implemented yet." };
}

export function getAiStatus(_db: DatabaseSync): AiStatus {
  return { keyConfigured: false, killSwitch: false, defaultModel: "", consents: [] };
}

export function getConsent(_db: DatabaseSync, feature: AiFeature): AiConsent {
  return {
    feature,
    enabled: false,
    provider: "openrouter",
    model: null,
    grantedAt: null,
    revokedAt: null,
    scope: { allowDailyCycle: false, maxExcerptChars: 280 },
  };
}

export function setConsent(
  _db: DatabaseSync,
  _feature: AiFeature,
  _enabled: boolean,
  _scope?: Partial<ConsentScope>,
): AiConsent {
  throw new Error("AI client not implemented yet.");
}

/** Strips emails, phone numbers, token-bearing URLs, long digit runs and @handles, then truncates. */
export function redactForAi(text: string, maxChars: number): string {
  return text.slice(0, maxChars);
}

/** Describes exactly what a request would send. Must be built from the same items the request uses. */
export function buildDisclosure(
  feature: AiFeature,
  purpose: string,
  model: string,
  items: readonly AiDisclosureItem[],
): AiDisclosure {
  return { feature, purpose, model, items, totalChars: items.reduce((n, i) => n + i.text.length, 0) };
}
