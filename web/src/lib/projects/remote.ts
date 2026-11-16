import { createHash } from "node:crypto";

/*
 * Git remote helpers. A remote is normalised to one https form so that
 * "git@github.com:me/app.git" and "https://GitHub.com/me/app/" match.
 * Nothing here touches the filesystem or the network.
 */

const SCP_LIKE = /^(?:[\w.-]+@)?([\w.-]+):([^\s]+)$/;

/** Returns "https://host/owner/repo" (lower-case, no .git), or null when the remote is not a recognisable host path. */
export function normalizeRemoteUrl(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > 500 || raw.includes("..")) return null;

  let host: string | null = null;
  let path: string | null = null;
  try {
    const url = new URL(raw);
    if (["http:", "https:", "ssh:", "git:"].includes(url.protocol)) {
      host = url.hostname;
      path = url.pathname;
    }
  } catch {
    const scp = SCP_LIKE.exec(raw);
    if (scp && !raw.includes("://")) {
      host = scp[1];
      path = `/${scp[2]}`;
    }
  }
  if (!host || !path) return null;

  const cleanPath = path
    .replace(/\\/g, "/")
    .replace(/\.git\/?$/i, "")
    .replace(/\/+$/, "")
    .replace(/^\/+/, "");
  if (!cleanPath) return null;
  return `https://${host.toLowerCase()}/${cleanPath.toLowerCase()}`;
}

/** A stable identifier for a remote: the first 24 hex characters of its SHA-256. */
export function externalIdFromRemote(input: string | null | undefined): string | null {
  const normalized = normalizeRemoteUrl(input);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}
