import { isAuthenticatedRequest } from "@/lib/documents/auth";
import { getDocumentFileInfo } from "@/lib/documents/queries";
import { readStoredFile } from "@/lib/documents/storage";
import { allowedMime, contentDisposition } from "@/lib/documents/upload";

/*
 * The only way to read a stored document. The proxy already requires a
 * session for this path; the check here is a second guard that also works on
 * a plain Request. Responses are always attachments, never inline, with
 * nosniff and no-store, so a browser cannot cache or render them as a page.
 * Nothing about the file is logged.
 */

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const MAX_ID_DIGITS = 12;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: BASE_HEADERS });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await isAuthenticatedRequest(request))) return jsonError("Unauthorized.", 401);

  const { id } = await context.params;
  if (!new RegExp(`^\\d{1,${MAX_ID_DIGITS}}$`).test(id)) return jsonError("Not found.", 404);

  const info = getDocumentFileInfo(Number(id));
  if (!info?.file_key) return jsonError("Not found.", 404);

  const bytes = await readStoredFile(info.file_key);
  if (!bytes) return jsonError("Not found.", 404);

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "content-type": allowedMime(info.file_mime) ?? "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "content-disposition": contentDisposition(info.file_name ?? "document"),
    },
  });
}
