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

export function toSummary(value, id) {
  const { session: s, totals: t } = value ?? {};
  if (!s || s.id !== id || !s.started_at || !s.ended_at || !t) throw new Error("Nanny did not return that finished session.");
  const payload = {
    version: 1,
    session_id: id,
    started_at: s.started_at,
    ended_at: s.ended_at,
    wall_seconds: t.wall_seconds,
    elapsed_seconds: t.session_elapsed_seconds,
    focus_seconds: t.verified_focus_seconds,
    distraction_seconds: t.distraction_seconds,
    idle_seconds: t.idle_seconds,
    break_seconds: t.break_seconds,
  };
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith("_seconds") && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Nanny returned invalid totals.");
  }
  return payload;
}

async function cappedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Nanny returned no body.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16_384) {
      await reader.cancel();
      throw new Error("Nanny response too large.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks));
}

export async function syncSession({ id, nanny, nannyToken, track, trackToken, send = false }) {
  id = positiveId(id);
  const nannyOrigin = origin(nanny, true);
  if (send) origin(track, false);
  const headers = (token) => {
    if (!token || !/^[A-Za-z0-9_-]{24,160}$/.test(token)) throw new Error("A valid scoped token is required.");
    return { Authorization: `Bearer ${token}` };
  };
  const request = { redirect: "error", signal: AbortSignal.timeout(7000) };
  const response = await fetch(`${nannyOrigin}/v1/sessions/${id}`, { ...request, headers: headers(nannyToken) });
  if (!response.ok) throw new Error(`Nanny returned ${response.status}.`);
  const summary = toSummary(await cappedJson(response), id);
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
  const summaries = [];
  for (const id of uniqueIds) {
    summaries.push(await syncSession({ id, nanny, nannyToken, track, trackToken, send: false }));
  }
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
