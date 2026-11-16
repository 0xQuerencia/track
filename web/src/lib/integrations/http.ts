/*
 * JSON request and response helpers for /api/integrations. Responses are
 * no-store and carry no CORS headers: browsers on other origins cannot read
 * them, and the connector is a non-browser client.
 */

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const NO_STORE = { "cache-control": "no-store" };

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response };

/**
 * Reads a JSON body with a hard byte cap. The declared length is checked
 * before reading, and the stream is counted as it arrives, so a missing or
 * false Content-Length cannot push the server past the cap.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<BodyResult> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type))
    return { ok: false, response: errorResponse(415, "Send JSON with Content-Type application/json.") };

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes)
    return { ok: false, response: errorResponse(413, "Request body is too large.") };

  const text = await readCapped(request, maxBytes);
  if (text === null)
    return { ok: false, response: errorResponse(413, "Request body is too large.") };

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "Invalid JSON.") };
  }
}

async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
