import type { DatabaseSync } from "node:sqlite";
import type { AiErrorCode, AiFeature } from "./types";

export type AiCallRecord = {
  id: number;
  feature: AiFeature;
  model: string;
  at: string;
  promptTokens: number | null;
  completionTokens: number | null;
  ok: boolean;
  errorCode: AiErrorCode | null;
};

export type AiCallInput = Omit<AiCallRecord, "id">;

/** Content is intentionally absent from this table and this read model. */
export function recordAiCall(db: DatabaseSync, call: AiCallInput): void {
  db.prepare(
    `INSERT INTO ai_calls
      (feature, model, at, prompt_tokens, completion_tokens, ok, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    call.feature,
    call.model,
    call.at,
    call.promptTokens,
    call.completionTokens,
    call.ok ? 1 : 0,
    call.errorCode,
  );
}

export function getRecentAiCalls(db: DatabaseSync, limit = 12): AiCallRecord[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 12;
  const rows = db
    .prepare(
      `SELECT id, feature, model, at, prompt_tokens, completion_tokens, ok, error_code
       FROM ai_calls ORDER BY id DESC LIMIT ?`,
    )
    .all(safeLimit) as {
    id: number;
    feature: AiFeature;
    model: string;
    at: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    ok: number;
    error_code: AiErrorCode | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    feature: row.feature,
    model: row.model,
    at: row.at,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    ok: row.ok === 1,
    errorCode: row.error_code,
  }));
}
