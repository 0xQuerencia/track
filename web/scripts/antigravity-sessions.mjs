#!/usr/bin/env node
// Read-only: turns Antigravity CLI history into a Track sessions payload (metadata only).
// Prompt text is never read into the output. Usage:
//   node scripts/antigravity-sessions.mjs > sessions.json   # then paste into Integrations
//   node scripts/antigravity-sessions.mjs --post https://host/api/integrations/sessions TOKEN
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const file = process.env.ANTIGRAVITY_HISTORY ?? path.join(homedir(), ".gemini", "antigravity-cli", "history.jsonl");
const byId = new Map();
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  const id = typeof row.conversationId === "string" ? row.conversationId : null;
  const at = Number(row.timestamp);
  if (!id || !Number.isFinite(at)) continue;
  const cur = byId.get(id) ?? { first: at, last: at, count: 0, cwd: null };
  cur.first = Math.min(cur.first, at);
  cur.last = Math.max(cur.last, at);
  cur.count += 1;
  if (typeof row.workspace === "string") cur.cwd = row.workspace;
  byId.set(id, cur);
}
const iso = (ms) => new Date(ms).toISOString();
const sessions = [...byId.entries()].sort((a, b) => b[1].last - a[1].last).slice(0, 500).map(([id, s]) => ({
  external_id: id,
  cwd_hint: s.cwd,
  project_hint: s.cwd ? path.basename(s.cwd) : null,
  created_at: iso(s.first),
  last_activity_at: iso(s.last),
  message_count: s.count,
}));
const payload = { version: 1, source: "manual", tool: "antigravity", generated_at: new Date().toISOString(), sessions };
const args = process.argv.slice(2);
if (args[0] === "--post") {
  const res = await fetch(args[1], { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${args[2]}` }, body: JSON.stringify({ ...payload, source: "connector" }) });
  console.error(res.status, await res.text());
} else console.log(JSON.stringify(payload));
