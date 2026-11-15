import type { DatabaseSync } from "node:sqlite";
import type { ZodType } from "zod";
import { getDb } from "../db";
import { aiProviders, publicReferer, type Provider } from "./config";
import { assertAiAllowed, AiPolicyError } from "./policy";
import { recordAiCall } from "./usage";
import type {
  AiErrorCode,
  AiFeature,
  ChatJsonDeps,
  ChatJsonRequest,
  ChatJsonResult,
} from "./types";

const TIMEOUT_MS = 180_000; // extra-high effort can think for a while
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_ATTEMPTS = 3;
const MAX_TOKENS = 32_768;

export class OpenRouterError extends Error {
  constructor(readonly code: "rate_limited" | "timeout" | "upstream" | "invalid_output", message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

type ProviderReply = {
  choices?: { message?: { content?: unknown } }[];
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function safeRecord(
  db: DatabaseSync,
  value: {
    feature: AiFeature;
    model: string;
    at: string;
    promptTokens: number | null;
    completionTokens: number | null;
    ok: boolean;
    errorCode: AiErrorCode | null;
  },
): void {
  try {
    recordAiCall(db, value);
  } catch {
    // Logging is intentionally content-free and best effort; never log an error or payload.
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const headerLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(headerLength) && headerLength > MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel();
    } catch {
      // A response rejected for size does not need further handling.
    }
    throw new OpenRouterError("upstream", "the AI provider returned a response that was too large.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new OpenRouterError("upstream", "the AI provider returned a response that was too large.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function fixedMessage(code: AiErrorCode): string {
  switch (code) {
    case "not_configured":
      return "The AI provider is not configured on this server.";
    case "disabled":
      return "AI calls are disabled by the server setting.";
    case "no_consent":
      return "AI is off for this feature until you opt in under Settings.";
    case "rate_limited":
      return "the AI provider is rate limiting requests. Try again later.";
    case "timeout":
      return "the AI provider did not respond before the 30 second timeout.";
    case "invalid_output":
      return "the AI provider returned output that did not match the expected JSON shape.";
    default:
      return "the AI provider could not complete this request.";
  }
}

function resultError<T>(code: AiErrorCode): ChatJsonResult<T> {
  return { ok: false, code, message: fixedMessage(code) };
}

function publicHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const referer = publicReferer();
  if (referer) {
    headers["HTTP-Referer"] = referer;
    headers["X-Title"] = "Track";
  }
  return headers;
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
}

/** Some free models wrap JSON in a markdown fence; unwrap it before parsing. */
function stripJsonFence(text: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return match ? match[1] : text;
}

async function zodResult<T>(schema: ZodType<T>, value: unknown): Promise<T> {
  const parsed = await schema.safeParseAsync(value);
  if (!parsed.success)
    throw new OpenRouterError("invalid_output", "the AI provider returned JSON with an unexpected shape.");
  return parsed.data;
}

/**
 * Server-side the AI provider chat-completions client. Every attempt passes the
 * consent/kill-switch gate, uses the fixed API origin, and writes metadata only.
 */
async function attempt<T>(
  request: ChatJsonRequest<T>,
  deps: ChatJsonDeps,
  provider: Provider,
): Promise<ChatJsonResult<T>> {
  const db = deps.db ?? getDb();
  const at = (deps.now ?? new Date()).toISOString();
  // The model comes from server config per provider; a per-request model is ignored on purpose.
  const model = provider.model;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let errorCode: AiErrorCode | null = null;

  try {
    assertAiAllowed({ feature: request.feature, purpose: request.purpose }, db);

    const apiKey = provider.apiKey;

    const maxTokens =
      typeof request.maxTokens === "number" && Number.isFinite(request.maxTokens)
        ? Math.max(1, Math.min(MAX_TOKENS, Math.floor(request.maxTokens)))
        : 1_024;
    const effort = provider.name === "primary" ? (request.effort ?? provider.effort) : provider.effort;
    const body = JSON.stringify({
      model,
      messages: request.messages,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      ...(effort ? { reasoning_effort: effort } : {}),
      stream: false,
    });
    const doFetch = deps.fetch ?? fetch;

    let response: Response | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        response = await doFetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { ...publicHeaders(), Authorization: `Bearer ${apiKey}` },
          body,
        });
      } catch (error) {
        if (isTimeout(error)) throw new OpenRouterError("timeout", "the AI provider request timed out.");
        throw new OpenRouterError("upstream", "the AI provider could not be reached.");
      }

      if (response.ok) break;
      try {
        await response.body?.cancel();
      } catch {
        // A failed response is discarded before a bounded retry.
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        if (response.status === 429)
          throw new OpenRouterError("rate_limited", "the AI provider rate limited the request.");
        throw new OpenRouterError("upstream", "the AI provider returned an unsuccessful response.");
      }
      await waitBeforeRetry(attempt);
    }

    if (!response?.ok)
      throw new OpenRouterError("upstream", "the AI provider returned an unsuccessful response.");
    const responseText = await readBoundedText(response);
    let providerReply: ProviderReply;
    try {
      providerReply = JSON.parse(responseText) as ProviderReply;
    } catch {
      throw new OpenRouterError("upstream", "the AI provider returned an unreadable response.");
    }

    const content = providerReply.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new OpenRouterError("invalid_output", "the AI provider returned no JSON content.");
    let json: unknown;
    try {
      json = JSON.parse(stripJsonFence(content));
    } catch {
      throw new OpenRouterError("invalid_output", "the AI provider returned invalid JSON.");
    }
    const data = await zodResult(request.schema, json);
    promptTokens = tokenCount(providerReply.usage?.prompt_tokens);
    completionTokens = tokenCount(providerReply.usage?.completion_tokens);
    safeRecord(db, {
      feature: request.feature,
      model,
      at,
      promptTokens,
      completionTokens,
      ok: true,
      errorCode: null,
    });
    return {
      ok: true,
      data,
      model,
      usage: { promptTokens, completionTokens },
    };
  } catch (error) {
    errorCode =
      error instanceof AiPolicyError || error instanceof OpenRouterError
        ? error.code
        : isTimeout(error)
          ? "timeout"
          : "upstream";
    safeRecord(db, {
      feature: request.feature,
      model,
      at,
      promptTokens,
      completionTokens,
      ok: false,
      errorCode,
    });
    return resultError(errorCode);
  }
}


const FALL_BACK_ON = new Set<AiErrorCode>(["rate_limited", "timeout", "upstream", "invalid_output"]);

/**
 * Tries the primary provider, then the fallback if the primary failed in a way
 * another provider could fix. Consent and kill-switch refusals never fall back.
 */
export async function chatJson<T>(
  request: ChatJsonRequest<T>,
  deps: ChatJsonDeps = {},
): Promise<ChatJsonResult<T>> {
  const providers = aiProviders();
  if (providers.length === 0) return resultError("not_configured");
  let last: ChatJsonResult<T> = resultError("upstream");
  for (const provider of providers) {
    last = await attempt(request, deps, provider);
    if (last.ok || !FALL_BACK_ON.has(last.code)) return last;
  }
  return last;
}
