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

export function aiBaseUrl(): string {
  const candidate = (process.env.AI_BASE_URL ?? "").trim();
  if (!candidate) return DEFAULT_AI_BASE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return DEFAULT_AI_BASE_URL;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return DEFAULT_AI_BASE_URL;
  }
}

export function aiApiKey(): string | null {
  return (process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "").trim() || null;
}

export function configuredModel(): string {
  const candidate = (process.env.AI_MODEL ?? process.env.OPENROUTER_MODEL ?? "").trim();
  return candidate && MODEL_SLUG_PATTERN.test(candidate) ? candidate : DEFAULT_AI_MODEL;
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
