import type { AiFeature } from "./types";

/**
 * Provider settings live on the server only (never in the repo): AI_BASE_URL,
 * AI_API_KEY and AI_MODEL (the older OPENROUTER_* names still work). The base URL
 * must be https without credentials. The model is pinned: no caller can override it.
 */
export const DEFAULT_AI_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_AI_MODEL = "cx/gpt-6-luna";
export const AI_FEATURES: readonly AiFeature[] = ["dreamer", "checkin", "assistant"];
export const MODEL_SLUG_PATTERN = /^[a-z0-9._/:-]{1,80}$/;

function safeBaseUrl(candidate: string, fallback: string): string {
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return fallback;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return fallback;
  }
}

const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const DEFAULT_AI_EFFORT = "xhigh";

export function aiBaseUrl(): string {
  return safeBaseUrl((process.env.AI_BASE_URL ?? "").trim(), DEFAULT_AI_BASE_URL);
}

export function aiApiKey(): string | null {
  return (process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "").trim() || null;
}

export function configuredModel(): string {
  const candidate = (process.env.AI_MODEL ?? process.env.OPENROUTER_MODEL ?? "").trim();
  return candidate && MODEL_SLUG_PATTERN.test(candidate) ? candidate : DEFAULT_AI_MODEL;
}

/** Reasoning effort for the primary model. Always extra high unless the server says otherwise. */
export function aiEffort(): string | null {
  const value = (process.env.AI_EFFORT ?? "").trim().toLowerCase();
  if (!value) return DEFAULT_AI_EFFORT;
  return (EFFORTS as readonly string[]).includes(value) && value !== "none" ? value : DEFAULT_AI_EFFORT;
}

export type Provider = { name: "primary" | "fallback"; baseUrl: string; apiKey: string; model: string; effort: string | null };

/**
 * Primary first (the pinned model at extra-high effort), then the optional fallback
 * (AI_FALLBACK_*; by default OpenRouter's free router) when the primary fails.
 */
export function aiProviders(): Provider[] {
  const providers: Provider[] = [];
  const key = aiApiKey();
  if (key) providers.push({ name: "primary", baseUrl: aiBaseUrl(), apiKey: key, model: configuredModel(), effort: aiEffort() });
  const fallbackKey = (process.env.AI_FALLBACK_API_KEY ?? "").trim();
  if (fallbackKey) {
    const model = (process.env.AI_FALLBACK_MODEL ?? "").trim();
    providers.push({
      name: "fallback",
      baseUrl: safeBaseUrl((process.env.AI_FALLBACK_BASE_URL ?? "").trim(), DEFAULT_AI_BASE_URL),
      apiKey: fallbackKey,
      model: MODEL_SLUG_PATTERN.test(model) ? model : "openrouter/free",
      effort: null,
    });
  }
  return providers;
}

export function aiConfigured(): boolean {
  return aiProviders().length > 0;
}

export function publicReferer(): string | null {
  const value = process.env.TRACK_PUBLIC_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password)
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
