import { cookies } from "next/headers";
import { transactionsCsv } from "@/lib/money/csv";
import { countTransactionsBetween, transactionsBetween } from "@/lib/money/queries";
import { isoDate, monthStart, todayStr } from "@/lib/dates";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/*
 * Transactions as a CSV download. Session-checked here as well as by the
 * proxy, so the route stays closed if the proxy rules change. Responses are
 * never cached, since they hold private financial data.
 */

export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000;

export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token)))
    return Response.json({ error: "Unauthorized." }, { status: 401, headers });

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? monthStart();
  const to = params.get("to") ?? todayStr();
  if (!isoDate(from) || !isoDate(to))
    return Response.json({ error: "from and to must be valid dates (YYYY-MM-DD)." }, { status: 400, headers });
  if (from > to)
    return Response.json({ error: "from must be on or before to." }, { status: 400, headers });
  if (countTransactionsBetween(from, to) > MAX_ROWS)
    return Response.json({ error: "That range is too large to export. Choose a shorter one." }, { status: 413, headers });

  const body = transactionsCsv(transactionsBetween(from, to, MAX_ROWS));
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transactions-${from}-to-${to}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
