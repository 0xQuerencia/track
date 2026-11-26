import assert from "node:assert/strict";
import { test } from "node:test";
import { syncSession, syncSessions } from "./sync.mjs";

test("preview has no outbound submission and send strips private fields", async (t) => {
  const token = "local_token_000000000000000000000";
  const session = {
    id: 7, started_at: "2026-11-26T11:00:00Z", ended_at: "2026-11-26T11:25:00Z",
    subject: "private-subject", goal: "private-goal",
  };
  const totals = {
    wall_seconds: 1500, session_elapsed_seconds: 1430, verified_focus_seconds: 1080,
    distraction_seconds: 180, idle_seconds: 20, break_seconds: 120,
  };
  const submitted = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(new Headers(options.headers).get("authorization"), `Bearer ${token}`);
    if (String(url).includes("/v1/integrations/track/v1/sessions")) return Response.json({ schema_version: 1, sessions: [{ id: 7,
      started_at: session.started_at, ended_at: session.ended_at, outcome: "completed", totals }] });
    if (String(url).endsWith("/api/integrations/study-nanny")) {
      submitted.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
    return new Response(null, { status: 404 });
  };
  const origin = "http://127.0.0.1:24351";
  const options = { id: 7, nanny: origin, nannyToken: token, track: origin, trackToken: token };
  const preview = await syncSession(options);
  assert.equal(submitted.length, 0);
  await syncSession({ ...options, send: true });
  assert.deepEqual(submitted, [preview]);
  assert.doesNotMatch(JSON.stringify(preview), /private|subject|goal/);
  await assert.rejects(syncSession({ ...options, nanny: "https://example.com" }), /loopback/);
  await assert.rejects(syncSession({ ...options, track: "http://example.com", send: true }), /requires HTTPS/);
  await assert.rejects(syncSession({ ...options, id: 99 }), /did not return/);
});

test("bounded multi-session preview requires explicit send and reports isolated failures", async (t) => {
  const token = "local_token_000000000000000000000";
  const submitted = [];
  const requested = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/v1/integrations/track/v1/sessions")) {
      requested.push(new URL(url).searchParams.get("before"));
      if (new Headers(options.headers).get("authorization") !== `Bearer ${token}`) return new Response(null, { status: 401 });
      const totals = { wall_seconds: 1500, session_elapsed_seconds: 1400, verified_focus_seconds: 900,
        distraction_seconds: 100, idle_seconds: 0, break_seconds: 100 };
      const allIds = Array.from({ length: 201 }, (_, i) => 201 - i);
      const rows = allIds.filter((id) => !new URL(url).searchParams.has("before") || id < Number(new URL(url).searchParams.get("before"))).slice(0, 100)
        .map((id) => ({ id, started_at: "2026-11-26T11:00:00Z", ended_at: "2026-11-26T11:25:00Z", outcome: "completed", totals }));
      return Response.json({ schema_version: 1, sessions: rows });
    }
    if (options.method === "POST" && String(url).endsWith("/api/integrations/study-nanny")) {
      const body = JSON.parse(options.body);
      submitted.push(body);
      return new Response(null, { status: body.session_id === 99 ? 403 : 200 });
    }
    return new Response(null, { status: 404 });
  };
  const origin = "http://127.0.0.1:24351";
  const options = { ids: [100, 99], nanny: origin, nannyToken: token, track: origin, trackToken: token };
  const preview = await syncSessions(options);
  assert.deepEqual(requested, [null, "102"]);
  assert.deepEqual(submitted, []);
  assert.deepEqual(preview.outcomes.map((o) => o.status), ["preview", "preview"]);
  assert.doesNotMatch(JSON.stringify(preview), /secret|goal/);
  const older = await syncSession({ ...options, id: 99 });
  assert.deepEqual(older, preview.previews[1]);
  const sent = await syncSessions({ ...options, send: true });
  assert.deepEqual(sent.outcomes.map((o) => o.status), ["sent", "failed"]);
  assert.equal(submitted.length, 2);
  assert.deepEqual(submitted[0], preview.previews[0]);
  assert.doesNotMatch(JSON.stringify(submitted), /secret|goal/);
  await assert.rejects(syncSessions({ ...options, ids: [7, 7] }), /unique/);
  await assert.rejects(syncSessions({ ...options, ids: Array.from({ length: 11 }, (_, i) => i + 1) }), /1 and 10/);
});

test("handoff rejects bad schema, invalid timestamps, and active-session conflicts", async (t) => {
  const token = "local_token_000000000000000000000";
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const origin = "http://127.0.0.1:24351";
  const options = { ids: [7], nanny: origin, nannyToken: token };
  globalThis.fetch = async () => Response.json({ schema_version: 2, sessions: [] });
  await assert.rejects(syncSessions(options), /invalid handoff page/);
  globalThis.fetch = async () => new Response(null, { status: 409 });
  await assert.rejects(syncSessions(options), /409/);
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(syncSessions(options), /401/);
  globalThis.fetch = async () => Response.json({ schema_version: 1, sessions: [{ id: 7,
    started_at: "bad", ended_at: "2026-11-26T11:25:00Z", outcome: "completed", totals: {} }] });
  await assert.rejects(syncSessions(options), /invalid handoff session/);
});
