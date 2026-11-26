import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { syncSession } from "./sync.mjs";

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
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    if (request.method === "GET" && request.url === "/v1/sessions/7") {
      response.end(JSON.stringify({ session, totals }));
    } else if (request.method === "POST" && request.url === "/api/integrations/study-nanny") {
      const chunks = [];
      for await (const c of request) chunks.push(c);
      submitted.push(JSON.parse(Buffer.concat(chunks)));
      response.end('{"ok":true}');
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const options = { id: 7, nanny: origin, nannyToken: token, track: origin, trackToken: token };
  const preview = await syncSession(options);
  assert.equal(submitted.length, 0);
  await syncSession({ ...options, send: true });
  assert.deepEqual(submitted, [preview]);
  assert.doesNotMatch(JSON.stringify(preview), /private|subject|goal/);
  await assert.rejects(syncSession({ ...options, nanny: "https://example.com" }), /loopback/);
  await assert.rejects(syncSession({ ...options, track: "http://example.com", send: true }), /requires HTTPS/);
  await assert.rejects(syncSession({ ...options, id: 99 }), /404/);
});
