import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { guessType, runOcr, splitQuestions, type OcrOutcome, type OcrRunner, type QuestionPart, tesseractRunner } from "./ocr";
import { storeImage } from "./images";

/** One screenshot in, a reviewable draft out. Nothing becomes a question until the user saves it. */

export type Draft = {
  imageId: number;
  duplicateOf: number | null;
  mime: string;
  status: OcrOutcome["status"] | "reused" | "rejected";
  confidence: number | null;
  warnings: string[];
  error: string | null;
  multiple: boolean;
  parts: (QuestionPart & { qtype: string })[];
};

export type IngestResult = { ok: true; draft: Draft } | { ok: false; name: string; error: string };

function saveOcr(db: DatabaseSync, imageId: number, o: OcrOutcome): void {
  db.prepare("INSERT INTO qv_ocr (image_id, engine, status, text, confidence, error) VALUES (?, 'tesseract', ?, ?, ?, ?)").run(
    imageId,
    o.status,
    o.text || null,
    o.confidence,
    "error" in o ? o.error : null,
  );
}

export async function ingestImage(
  name: string,
  buffer: Buffer,
  opts: { languages?: string; runner?: OcrRunner; db?: DatabaseSync } = {},
): Promise<IngestResult> {
  const db = opts.db ?? getDb();
  const stored = storeImage(buffer, db);
  if (!stored.ok) return { ok: false, name, error: stored.error };
  const { imageId, duplicateOf, mime } = stored.image;

  // The same screenshot already read once: reuse that text instead of reading it again.
  const prior = db.prepare("SELECT status, text, confidence FROM qv_ocr WHERE image_id = ? AND status = 'ok' ORDER BY id DESC LIMIT 1").get(imageId) as
    | { status: string; text: string; confidence: number | null }
    | undefined;
  let outcome: OcrOutcome;
  let reused = false;
  if (prior) {
    outcome = { status: "ok", text: prior.text, confidence: prior.confidence ?? 0, warnings: [] };
    reused = true;
  } else {
    outcome = await runOcr(buffer, opts.languages ?? "eng", opts.runner ?? tesseractRunner);
    saveOcr(db, imageId, outcome);
  }
  const split = outcome.text ? splitQuestions(outcome.text) : { multiple: false, parts: [{ text: "", options: [] }] };
  return {
    ok: true,
    draft: {
      imageId,
      duplicateOf,
      mime,
      status: reused ? "reused" : outcome.status,
      confidence: outcome.confidence,
      warnings: outcome.warnings,
      error: "error" in outcome ? outcome.error : null,
      multiple: split.multiple,
      parts: split.parts.map((p) => ({ ...p, qtype: guessType(p) })),
    },
  };
}
