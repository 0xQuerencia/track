import { z } from "zod";
import { MAX_SESSIONS_PER_REQUEST, SESSION_STATUSES, SESSION_TOOLS } from "./constants";

/*
 * Wire format for session imports (version 1). Objects are strict: any key not
 * listed here is rejected, so a connector that starts sending transcript text
 * fails loudly instead of being stored. Text fields carry a generous hard cap;
 * anything longer is refused, anything shorter is cleaned by sanitize.ts.
 */

const HARD_TEXT_CAP = 10_000;
const text = () => z.string().max(HARD_TEXT_CAP).nullish();

export const sessionItemSchema = z.strictObject({
  external_id: z.string().max(HARD_TEXT_CAP),
  title: text(),
  project_hint: text(),
  cwd_hint: text(),
  created_at: text(),
  last_activity_at: text(),
  status: z.enum(SESSION_STATUSES).optional(),
  resume_command: text(),
  message_count: z.number().int().min(0).max(10_000_000).nullish(),
  model: text(),
  summary: text(),
});

export const sessionsEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  source: z.enum(["connector", "manual"]),
  tool: z.enum(SESSION_TOOLS),
  generated_at: text(),
  sessions: z.array(sessionItemSchema).max(MAX_SESSIONS_PER_REQUEST),
});

export type SessionItemInput = z.infer<typeof sessionItemSchema>;
export type SessionsEnvelope = z.infer<typeof sessionsEnvelopeSchema>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_REPORTED_ISSUES = 3;

/**
 * Validates an unknown payload. The error names the offending paths and rules
 * but never echoes the submitted values, so it is safe to show and to log.
 */
export function parseSessionsEnvelope(raw: unknown): ParseResult<SessionsEnvelope> {
  const result = sessionsEnvelopeSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => {
      const path = issue.path.map(String).join(".") || "payload";
      return `${path}: ${issue.message}`;
    });
  return { ok: false, error: `Invalid sessions payload. ${issues.join("; ")}` };
}
