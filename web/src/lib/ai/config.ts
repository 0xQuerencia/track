import type { AiFeature } from "./types";

/**
 * Keep provider configuration on the server. The base URL is deliberately a
 * source constant so configuration can never redirect requests to another host.
 */
export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
export const AI_FEATURES: readonly AiFeature[] = ["dreamer", "checkin"];
export const MODEL_SLUG_PATTERN = /^[a-z0-9._/:-]{1,80}$/;

export function configuredModel(): string {
  const candidate = process.env.OPENROUTER_MODEL?.trim();
  return candidate && MODEL_SLUG_PATTERN.test(candidate)
    ? candidate
    : DEFAULT_OPENROUTER_MODEL;
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
