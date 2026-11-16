import type { DatabaseSync } from "node:sqlite";
import { chatJson as sendChatJson } from "./openrouter";
import {
  assertAiAllowed,
  getAiStatus as readAiStatus,
  getConsent as readConsent,
  setConsent as writeConsent,
} from "./policy";
import { buildDisclosure as createDisclosure, messagesFromDisclosure, redactForAi } from "./redact-for-ai";
import { getRecentAiCalls } from "./usage";
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
export { AiPolicyError } from "./policy";
export { OpenRouterError } from "./openrouter";
export { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "./config";
export { getRecentAiCalls, messagesFromDisclosure };
export type { AiCallRecord } from "./usage";

/* These exports are server-side only. Never import this module from a client component. */
export async function chatJson<T>(
  request: ChatJsonRequest<T>,
  deps?: ChatJsonDeps,
): Promise<ChatJsonResult<T>> {
  return sendChatJson(request, deps);
}

export function getAiStatus(db: DatabaseSync): AiStatus {
  return readAiStatus(db);
}

export function getConsent(db: DatabaseSync, feature: AiFeature): AiConsent {
  return readConsent(db, feature);
}

export function setConsent(
  db: DatabaseSync,
  feature: AiFeature,
  enabled: boolean,
  scope?: Partial<ConsentScope>,
): AiConsent {
  return writeConsent(db, feature, enabled, scope);
}

/** Strips direct identifiers and token-bearing URLs, then truncates the excerpt. */
export { redactForAi };

/** Describes exactly the redacted text that messagesFromDisclosure serializes. */
export function buildDisclosure(
  feature: AiFeature,
  purpose: string,
  model: string,
  items: readonly AiDisclosureItem[],
): AiDisclosure {
  return createDisclosure(feature, purpose, model, items);
}

/* Re-exported so server-side callers can use the single policy gate directly. */
export { assertAiAllowed };
