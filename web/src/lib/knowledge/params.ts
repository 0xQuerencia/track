/*
 * Reads URL search params. Each value is trimmed, length-limited and, where
 * the set is fixed, checked against an allowlist. Unknown values fall back to
 * the default instead of reaching a query.
 */

export type RawParams = Record<string, string | string[] | undefined>;

export function text(raw: RawParams, key: string, max = 80): string {
  const value = raw[key];
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function choice<T extends string>(raw: RawParams, key: string, allowed: readonly T[]): T | null {
  const value = text(raw, key, 60);
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function positiveInt(raw: RawParams, key: string): number | null {
  const value = text(raw, key, 12);
  return /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

export function pageNumber(raw: RawParams): number {
  return positiveInt(raw, "page") ?? 1;
}

export function flag(raw: RawParams, key: string): boolean {
  return text(raw, key, 4) === "1";
}

/** A path with a query string; empty, null and false values are left out. */
export function hrefWith(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === false || value === "") continue;
    params.set(key, value === true ? "1" : String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
