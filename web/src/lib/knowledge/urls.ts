/*
 * Web addresses that users save (bookmarks, research links). Only http and
 * https are accepted, and the app never fetches them: a saved URL is text
 * that is shown back as a link, so no request is made on the server (no SSRF).
 */

export const MAX_URL_LENGTH = 2000;

/** Returns the normalized http(s) URL, or null when the input is not one. */
export function safeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f\s]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.href;
}

/** Short label for a saved URL: its host and path, without the scheme. */
export function urlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}
