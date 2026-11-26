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
  const trackOrigin = send ? origin(track, false) : null;
  const headers = (token) => {
    if (!token || !/^[A-Za-z0-9_-]{24,160}$/.test(token)) throw new Error("A valid scoped token is required.");
    return { Authorization: `Bearer ${token}` };
  };
  const request = { redirect: "error", signal: AbortSignal.timeout(7000) };
  const response = await fetch(`${nannyOrigin}/v1/sessions/${id}`, { ...request, headers: headers(nannyToken) });
  if (!response.ok) throw new Error(`Nanny returned ${response.status}.`);
  const summary = toSummary(await cappedJson(response), id);
  if (send) {
    const stored = await fetch(`${trackOrigin}/api/integrations/study-nanny`, {
      redirect: "error", signal: AbortSignal.timeout(7000), method: "POST",
      headers: { ...headers(trackToken), "content-type": "application/json" },
      body: JSON.stringify(summary),
    });
    const status = stored.status;
    await stored.body?.cancel();
    if (status !== 200) throw new Error(`Track returned ${status}.`);
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [id, flag, ...extra] = process.argv.slice(2);
    if (!id || extra.length || (flag && flag !== "--send")) throw new Error("Usage: node sync.mjs SESSION_ID [--send]");
    const nannyToken = (await readFile(process.env.NANNY_READ_TOKEN_FILE, "utf8")).trim();
    const trackToken = flag === "--send" ? (await readFile(process.env.TRACK_NANNY_TOKEN_FILE, "utf8")).trim() : undefined;
    const summary = await syncSession({ id, nanny: process.env.NANNY_ORIGIN ?? "http://127.0.0.1:24351",
      nannyToken, track: process.env.TRACK_ORIGIN, trackToken, send: flag === "--send" });
    console.log(JSON.stringify(summary, null, 2));
    console.error(flag ? "Track accepted the summary." : "Preview only; no upload.");
  } catch (error) {
    console.error(error instanceof Error && error.name === "TypeError" ? "Invalid configuration or connection failed." : error.message);
    process.exitCode = 1;
  }
}
