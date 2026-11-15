import { getDb } from "@/lib/db";
import { exportVault } from "@/lib/qv/portable";

/** Full vault backup (questions, screenshots, OCR text, attempts). Session cookie required via the proxy. */
export const dynamic = "force-dynamic";

export async function GET() {
  const body = JSON.stringify(exportVault(getDb()));
  return new Response(body, {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="question-vault-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
}
