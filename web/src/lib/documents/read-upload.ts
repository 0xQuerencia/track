import { checkUploadContent, checkUploadMeta } from "./upload";
import type { FileInput } from "./repo";

/*
 * Reads the optional file field of a document form. Returns null when no file
 * was chosen, a failure with a user-facing message, or the validated bytes.
 * The bytes are read only after the metadata checks pass, so an oversize or
 * wrong-type file is never loaded into memory.
 */

export type UploadResult =
  | { ok: true; file: FileInput }
  | { ok: false; error: string }
  | null;

export async function readUpload(value: FormDataEntryValue | null): Promise<UploadResult> {
  if (!(value instanceof File)) return null;
  if (value.size === 0 && value.name === "") return null;

  const meta = checkUploadMeta({
    name: value.name,
    declaredType: value.type,
    size: value.size,
  });
  if (!meta.ok) return { ok: false, error: meta.error };

  const bytes = new Uint8Array(await value.arrayBuffer());
  const content = checkUploadContent(meta.type, bytes);
  if (!content.ok) return { ok: false, error: content.error };

  return {
    ok: true,
    file: { displayName: meta.displayName, mime: meta.type.mime, bytes },
  };
}
