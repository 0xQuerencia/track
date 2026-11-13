import { authorizeApi, denied } from "@/lib/api-auth";
import { applyOps } from "@/lib/api-sync";

export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

export async function POST(request: Request) {
  const auth = authorizeApi(request);
  if (!auth.ok) return denied(auth);

  const text = await request.text();
  if (text.length > MAX_BODY)
    return Response.json({ error: "Body too large." }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const results = applyOps((body as { ops?: unknown } | null)?.ops);
  if ("error" in results)
    return Response.json({ error: results.error }, { status: 400 });
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
