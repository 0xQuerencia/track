import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { POST } from "../../src/app/api/integrations/study-nanny/route.ts";
import { runMigrations } from "../../src/lib/migrations/index.ts";
import { createToken } from "../../src/lib/security/integration-tokens.ts";
import { useAsAppDb } from "../../src/lib/sessions/test-support.ts";
import { recentCompletedSessions } from "../../src/lib/study-nanny/sessions.ts";
import { syncSessions } from "./sync.mjs";

const binaries = process.env.NANNY_TEST_BIN_DIR;
if (!binaries) throw new Error("Set NANNY_TEST_BIN_DIR to the built Study Nanny debug binaries.");
const local = "127.0.0.1";
const listen = async (server) => {
  server.listen(0, local);
  await once(server, "listening");
  return server.address().port;
};
const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
const profile = await mkdtemp(join(tmpdir(), "track-nanny-interop-"));
const db = new DatabaseSync(":memory:");
let daemon;
let trackServer;
try {
  runMigrations(db);
  useAsAppDb(db);
  const trackToken = createToken(db, "Synthetic Nanny", ["study-nanny:write"]).token;
  let trackRequests = 0;
  trackServer = createServer(async (req, res) => {
    try {
      trackRequests++;
      assert.equal(req.url, "/api/integrations/study-nanny");
      assert.equal(req.method, "POST");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const reply = await POST(new Request("http://track.test/api/integrations/study-nanny", {
        method: "POST", headers: req.headers, body: Buffer.concat(chunks),
      }));
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      res.end(await reply.text());
    } catch {
      res.writeHead(500).end();
    }
  });
  const track = "http://" + local + ":" + await listen(trackServer);
  const reservation = createServer();
  const daemonPort = await listen(reservation);
  await close(reservation);
  const nanny = "http://" + local + ":" + daemonPort;
  const args = ["--data-dir", profile, "--port", String(daemonPort)];
  daemon = spawn(join(binaries, "nanny-daemon"), [...args, "--openrouter-key-file", join(profile, "absent")], { stdio: "inherit" });
  let ready = false;
  for (let attempts = 0; attempts < 50; attempts++) {
    try {
      if ((await fetch(nanny + "/v1/health", { signal: AbortSignal.timeout(250) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (daemon.exitCode !== null) break;
    await delay(50);
  }
  assert(ready, "synthetic Nanny daemon did not start");
  const cli = async (...command) => {
    const { stdout } = await promisify(execFile)(join(binaries, "nanny"), [...args, "--json", ...command], { timeout: 5000 });
    return JSON.parse(stdout);
  };
  const nannyToken = (await readFile(join(profile, "read.token"), "utf8")).trim();
  const { session } = await cli("start", "--subject", "Synthetic private subject", "--goal", "Synthetic private goal");
  const config = { ids: [session.id], nanny, nannyToken, track, trackToken };
  await assert.rejects(syncSessions(config), /409/);
  await delay(1100);
  await cli("stop");
  const preview = await syncSessions(config);
  assert.equal(trackRequests, 0);
  assert.equal(preview.outcomes[0].status, "preview");
  assert.doesNotMatch(JSON.stringify(preview), /Synthetic private/i);
  for (let i = 0; i < 2; i++) {
    const sent = await syncSessions({ ...config, send: true });
    assert.equal(sent.outcomes[0].status, "sent");
    assert.deepEqual(sent.previews, preview.previews);
  }
  assert.equal(trackRequests, 2);
  const stored = recentCompletedSessions(db);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].session_id, session.id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM focus_sessions").get().n, 0);
  console.log("interop smoke passed: real Nanny daemon to Track route and isolated database");
} finally {
  if (daemon && daemon.exitCode === null && daemon.signalCode === null) {
    daemon.kill("SIGTERM");
    await once(daemon, "exit");
  }
  if (trackServer?.listening) await close(trackServer);
  useAsAppDb(undefined);
  db.close();
  await rm(profile, { recursive: true, force: true });
}
