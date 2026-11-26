import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const timestamp = z.iso.datetime();
const seconds = z.number().int().min(0).max(366 * 24 * 60 * 60);

export const completedSession = z.strictObject({
  version: z.literal(1),
  session_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  started_at: timestamp,
  ended_at: timestamp,
  wall_seconds: seconds,
  elapsed_seconds: seconds,
  focus_seconds: seconds,
  distraction_seconds: seconds,
  idle_seconds: seconds,
  break_seconds: seconds,
}).refine((s) =>
  Date.parse(s.ended_at) >= Date.parse(s.started_at)
  && s.elapsed_seconds <= s.wall_seconds
  && s.focus_seconds + s.distraction_seconds + s.idle_seconds + s.break_seconds <= s.wall_seconds,
  "Invalid completed session bounds");

export type CompletedSession = Omit<z.infer<typeof completedSession>, "version">;

export function storeCompletedSession(db: DatabaseSync, tokenId: number, value: unknown) {
  const parsed = completedSession.safeParse(value);
  if (!parsed.success) return null;
  const s = parsed.data;
  const result = db.prepare(`
    INSERT INTO study_nanny_sessions(token_id, session_id, started_at, ended_at,
      wall_seconds, elapsed_seconds, focus_seconds, distraction_seconds, idle_seconds, break_seconds)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(token_id, session_id) DO NOTHING
  `).run(tokenId, s.session_id, new Date(s.started_at).toISOString(), new Date(s.ended_at).toISOString(),
    s.wall_seconds, s.elapsed_seconds, s.focus_seconds, s.distraction_seconds, s.idle_seconds, s.break_seconds);
  return { inserted: Number(result.changes) === 1 };
}

export function recentCompletedSessions(db: DatabaseSync): CompletedSession[] {
  return db.prepare(`
    SELECT session_id, started_at, ended_at, wall_seconds, elapsed_seconds,
      focus_seconds, distraction_seconds, idle_seconds, break_seconds
    FROM study_nanny_sessions ORDER BY ended_at DESC, token_id, session_id LIMIT 10
  `).all() as CompletedSession[];
}

export function unassignedSeconds(session: CompletedSession): number {
  return session.wall_seconds - session.focus_seconds - session.distraction_seconds
    - session.idle_seconds - session.break_seconds;
}
