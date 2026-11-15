/*
 * Upload validation for the document vault. Pure functions: no filesystem and
 * no database, so every rule here is unit-tested.
 *
 * Checks, in order: the declared name's extension is on the allowlist, the
 * declared content type (if any) agrees with it, the size is within limits,
 * and the bytes match the format (magic numbers for binary types, valid UTF-8
 * with no NUL bytes for text).
 *
 * The display name is sanitised for showing and for a download header only.
 * It never influences where bytes are stored.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DISPLAY_NAME = 120;

export type AllowedType = {
  extension: string;
  mime: string;
  /** Checks the leading bytes. Text types use `isText` instead. */
  matchesMagic?: (bytes: Uint8Array) => boolean;
  isText?: boolean;
};

const startsWith = (...signature: number[]) => (bytes: Uint8Array): boolean =>
  signature.every((value, index) => bytes[index] === value);

const isWebp = (bytes: Uint8Array): boolean =>
  startsWith(0x52, 0x49, 0x46, 0x46)(bytes) &&
  bytes.length >= 12 &&
  bytes[8] === 0x57 &&
  bytes[9] === 0x45 &&
  bytes[10] === 0x42 &&
  bytes[11] === 0x50;

const PDF = startsWith(0x25, 0x50, 0x44, 0x46, 0x2d); // "%PDF-"
const PNG = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = startsWith(0xff, 0xd8, 0xff);
const ZIP = startsWith(0x50, 0x4b, 0x03, 0x04); // .docx is a zip container

export const ALLOWED_TYPES: readonly AllowedType[] = [
  { extension: "pdf", mime: "application/pdf", matchesMagic: PDF },
  { extension: "png", mime: "image/png", matchesMagic: PNG },
  { extension: "jpg", mime: "image/jpeg", matchesMagic: JPEG },
  { extension: "jpeg", mime: "image/jpeg", matchesMagic: JPEG },
  { extension: "webp", mime: "image/webp", matchesMagic: isWebp },
  { extension: "txt", mime: "text/plain", isText: true },
  { extension: "md", mime: "text/markdown", isText: true },
  {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    matchesMagic: ZIP,
  },
];

/** The allowed entry for a stored MIME type, or null for anything else. */
export function allowedMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  return ALLOWED_TYPES.some((type) => type.mime === mime) ? mime : null;
}

export type UploadCheck =
  | { ok: true; type: AllowedType; displayName: string }
  | { ok: false; error: string };

/** Keeps only the last path segment, drops control characters and bounds the length. */
export function sanitizeDisplayName(raw: string): string {
  const lastSegment = raw.split(/[\\/]/).pop() ?? "";
  // Control characters and characters that break a header or a filename.
  const cleaned = lastSegment
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return cleaned.slice(0, MAX_DISPLAY_NAME) || "document";
}

/** The lowercase extension of a name, without the dot. Empty when there is none. */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Checks everything known before the bytes are read: name, declared type, size. */
export function checkUploadMeta(input: {
  name: string;
  declaredType: string;
  size: number;
}): UploadCheck {
  if (!Number.isFinite(input.size) || input.size <= 0)
    return { ok: false, error: "The file is empty." };
  if (input.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: "Files must be 10 MB or smaller." };

  const extension = extensionOf(input.name);
  const type = ALLOWED_TYPES.find((candidate) => candidate.extension === extension);
  if (!type)
    return { ok: false, error: "That file type is not allowed. Use PDF, PNG, JPG, WebP, TXT, MD or DOCX." };

  // Browsers often send an empty or generic type. A specific type that
  // disagrees with the extension is a mismatch and is refused.
  const declared = input.declaredType.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== type.mime)
    return { ok: false, error: "The file type does not match its extension." };

  return { ok: true, type, displayName: sanitizeDisplayName(input.name) };
}

/** Checks that the bytes really are the type the extension claims. */
export function checkUploadContent(type: AllowedType, bytes: Uint8Array): { ok: true } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_UPLOAD_BYTES)
    return { ok: false, error: "Files must be 10 MB or smaller." };
  const mismatch = { ok: false as const, error: "The file contents do not match its type." };
  if (type.isText) {
    if (bytes.includes(0)) return mismatch;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return mismatch;
    }
    return { ok: true };
  }
  if (type.matchesMagic && !type.matchesMagic(bytes)) return mismatch;
  return { ok: true };
}

/**
 * Value for the Content-Disposition header. ASCII-only filename plus an
 * RFC 5987 UTF-8 form, so unusual names download intact and cannot break the
 * header.
 */
export function contentDisposition(displayName: string): string {
  const ascii = displayName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "document";
  const encoded = encodeURIComponent(displayName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
