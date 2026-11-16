import type { DatabaseSync } from "node:sqlite";
import type { ZodType } from "zod";

/*
 * Contract between the shared AI client (src/lib/ai/*) and its callers
 * (Dreamer today, anything else later). Callers import ONLY from "@/lib/ai".
 * Every outgoing request is gated by explicit per-feature consent, and the
 * disclosure shown to the user is built from the same payload that is sent.
 */

export type AiFeature = "dreamer" | "checkin" | "assistant" | "vault";

export type AiErrorCode =
  | "not_configured" // no AI_API_KEY
  | "disabled" // TRACK_AI_DISABLED=1
  | "no_consent" // the user has not opted in for this feature
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "invalid_output"; // reply failed schema validation

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | readonly ContentPart[] };

/** One redacted excerpt that would leave the machine. `id` is the evidence id the model may cite. */
export type AiDisclosureItem = { id: string; label: string; text: string };

export type AiDisclosure = {
  feature: AiFeature;
  purpose: string;
  model: string;
  items: readonly AiDisclosureItem[];
  totalChars: number;
};

export type ChatJsonRequest<T> = {
  feature: AiFeature;
  purpose: string;
  messages: readonly ChatMessage[];
  schema: ZodType<T>;
  /** Ignored: the model is pinned by AI_MODEL (default cx/gpt-6-luna). */
  model?: string;
  maxTokens?: number;
  /** Lower reasoning effort for simple jobs such as reading a screenshot. Defaults to the server's setting. */
  effort?: "minimal" | "low" | "medium";
};

/** Plain-text AI completions for prose agents. Consent, key and usage policy are shared with chatJson. */
export type ChatTextRequest = Omit<ChatJsonRequest<string>, "schema">;
export type ChatTextResult = ChatJsonResult<string>;

export type ChatJsonDeps = { fetch?: typeof fetch; db?: DatabaseSync; now?: Date };

export type ChatJsonResult<T> =
  | { ok: true; data: T; model: string; usage: { promptTokens: number | null; completionTokens: number | null } }
  | { ok: false; code: AiErrorCode; message: string };

export type ConsentScope = {
  /** When true the daily cycle may call the provider without a per-run confirmation. */
  allowDailyCycle: boolean;
  /** Max characters per excerpt that may be sent. */
  maxExcerptChars: number;
};

export type AiConsent = {
  feature: AiFeature;
  enabled: boolean;
  provider: "openrouter";
  model: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  scope: ConsentScope;
};

export type AiStatus = {
  keyConfigured: boolean; // never the key itself
  killSwitch: boolean;
  defaultModel: string;
  consents: readonly AiConsent[];
};
