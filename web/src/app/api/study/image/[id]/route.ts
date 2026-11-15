import { getDb } from "@/lib/db";
import { loadImage } from "@/lib/qv/images";

/** Screenshots are private: the proxy requires a session cookie for every /api/study route except /jobs. */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const image = Number.isInteger(id) && id > 0 ? loadImage(id, getDb()) : null;
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { "content-type": image.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-disposition": "inline" },
  });
}
