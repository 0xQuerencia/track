import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

function origin(raw, localOnly) {
  const u = new URL(raw);
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.username || u.password || u.pathname !== "/" || u.search || u.hash ||
      (localOnly ? !loopback || u.protocol !== "http:" : u.protocol !== "https:" && !(loopback && u.protocol === "http:"))) {
    throw new Error(localOnly ? "Nanny requires an HTTP loopback origin." : "Track requires HTTPS or an HTTP loopback origin.");
  }
  return u.origin;
}

function positiveId(value) {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error("Use a positive session ID.");
  return Number(value);
}

function isTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function toHandoffSummary(row) {
  if (!isTimestamp(row.started_at) || !isTimestamp(row.ended_at) ||
      Date.parse(row.ended_at) < Date.parse(row.started_at) ||
      typeof row.outcome !== "string" || !row.outcome) {
    throw new Error("Nanny returned an invalid handoff session.");
  }
  const t = row.totals ?? {};
  const payload = {
    version: 1,
    session_id: row.id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    wall_seconds: t.wall_seconds,
    elapsed_seconds: t.session_elapsed_seconds,
    focus_seconds: t.verified_focus_seconds,
    distraction_seconds: t.distraction_seconds,
    idle_seconds: t.idle_seconds,
    break_seconds: t.break_seconds,
  };
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith("_seconds") && (!Number.isSafeInteger(value) || value < 0 || value > 366 * 86_400)) {
      throw new Error("Nanny returned invalid handoff totals.");
    }
  }
  if (payload.elapsed_seconds > payload.wall_seconds ||
      payload.focus_seconds + payload.distraction_seconds + payload.idle_seconds + payload.break_seconds > payload.wall_seconds) {
    throw new Error("Nanny returned invalid handoff totals.");
  }
  return payload;
}

async function cappedHandoffPage(response, remainingBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Nanny returned no body.");
  const chunks = [];
  let size = 0;
  const maxBytes = Math.min(512 * 1024, remainingBytes);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Nanny response exceeded the handoff byte limit.");
    }
    chunks.push(value);
  }
  return { value: JSON.parse(Buffer.concat(chunks)), bytes: size };
}

export async function syncSession({ id, nanny, nannyToken, track, trackToken, send = false }) {
  id = positiveId(id);
  if (send) origin(track, false);
  const [summary] = await readSelectedSessions({ ids: [id], nanny, nannyToken });
  if (send) await postSummary({ summary, track, trackToken });
  return summary;
}

// Import only IDs the user explicitly supplied. Fetch every preview first so
// malformed or unavailable sessions cannot cause a partially confirmed send.
export async function syncSessions({ ids, nanny, nannyToken, track, trackToken, send = false }) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10) {
    throw new Error("Choose between 1 and 10 session IDs.");
  }
  const uniqueIds = [...new Set(ids.map(positiveId))];
  if (uniqueIds.length !== ids.length) throw new Error("Session IDs must be unique.");
  const summaries = await readSelectedSessions({ ids: uniqueIds, nanny, nannyToken });
  const outcomes = [];
  for (const summary of summaries) {
    if (!send) {
      outcomes.push({ session_id: summary.session_id, status: "preview" });
      continue;
    }
    try {
      await postSummary({ summary, track, trackToken });
      outcomes.push({ session_id: summary.session_id, status: "sent" });
    } catch (error) {
      outcomes.push({ session_id: summary.session_id, status: "failed", error: safeError(error) });
    }
  }
  return { previews: summaries, outcomes };
}

async function readSelectedSessions({ ids, nanny, nannyToken }) {
  const nannyOrigin = origin(nanny, true);
  if (!nannyToken || !/^[A-Za-z0-9_-]{24,160}$/.test(nannyToken)) throw new Error("A valid scoped token is required.");
  const selected = new Set(ids);
  const found = new Map();
  let before;
  let totalBytes = 0;
  // Ten pages at 100 rows bound both request count and total response bytes.
  for (let pageNumber = 0; pageNumber < 10 && found.size < selected.size; pageNumber++) {
    const query = new URLSearchParams({ limit: "100" });
    if (before !== undefined) query.set("before", String(before));
    const response = await fetch(`${nannyOrigin}/v1/integrations/track/v1/sessions?${query}`, {
      redirect: "error", signal: AbortSignal.timeout(7000), headers: { Authorization: `Bearer ${nannyToken}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Nanny returned ${response.status}.`);
    }
    const { value: page, bytes } = await cappedHandoffPage(response, 5 * 1024 * 1024 - totalBytes);
    totalBytes += bytes;
    if (page?.schema_version !== 1 || !Array.isArray(page.sessions) || page.sessions.length > 100) throw new Error("Nanny returned an invalid handoff page.");
    if (page.sessions.length === 0) break;
    let lastId = before;
    for (const row of page.sessions) {
      if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || (lastId !== undefined && row.id >= lastId)) {
        throw new Error("Nanny returned invalid handoff pagination.");
      }
      lastId = row.id;
      if (selected.has(row.id)) found.set(row.id, toHandoffSummary(row));
    }
    before = lastId;
    if (page.sessions.length < 100) break;
  }
  if (found.size !== selected.size) throw new Error("Nanny did not return all selected finished sessions within the page limit.");
  return ids.map((id) => found.get(id));
}

async function postSummary({ summary, track, trackToken }) {
  const trackOrigin = origin(track, false);
  if (!trackToken || !/^[A-Za-z0-9_-]{24,160}$/.test(trackToken)) throw new Error("A valid scoped token is required.");
  const stored = await fetch(`${trackOrigin}/api/integrations/study-nanny`, {
    redirect: "error", signal: AbortSignal.timeout(7000), method: "POST",
    headers: { Authorization: `Bearer ${trackToken}`, "content-type": "application/json" },
    body: JSON.stringify(summary),
  });
  const status = stored.status;
  await stored.body?.cancel();
  if (status !== 200) throw new Error(`Track returned ${status}.`);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : "Import failed.";
  return message.replace(/https?:\/\/[^\s]+/g, "[endpoint]").slice(0, 160);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const send = args.includes("--send");
    if (args.filter((arg) => arg === "--send").length > 1) throw new Error("Use --send once after reviewing the preview.");
    const ids = send ? args.slice(0, -1) : args;
    if (ids.length < 1 || ids.length > 10 || (send && args.at(-1) !== "--send") || ids.includes("--send")) throw new Error("Usage: node sync.mjs SESSION_ID [SESSION_ID ...] [--send] (up to 10 IDs)");
    const nannyToken = (await readFile(process.env.NANNY_READ_TOKEN_FILE, "utf8")).trim();
    const trackToken = send ? (await readFile(process.env.TRACK_NANNY_TOKEN_FILE, "utf8")).trim() : undefined;
    const result = await syncSessions({ ids, nanny: process.env.NANNY_ORIGIN ?? "http://127.0.0.1:24351",
      nannyToken, track: process.env.TRACK_ORIGIN, trackToken, send });
    console.log(JSON.stringify(result, null, 2));
    console.error(send ? "Transmission requested; review per-session outcomes." : "Preview only; no upload.");
    if (result.outcomes.some(({ status }) => status === "failed")) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error && error.name === "TypeError" ? "Invalid configuration or connection failed." : error.message);
    process.exitCode = 1;
  }
}
