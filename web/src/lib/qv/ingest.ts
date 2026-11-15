import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { guessType, runOcr, splitQuestions, type OcrOutcome, type OcrRunner, type QuestionPart, tesseractRunner } from "./ocr";
import { storeImage } from "./images";
import { aiRead, type AiRead } from "./ai-ocr";
import { configuredModel } from "../ai/config";

const AI_SEPARATOR = "\n\n<<<question>>>\n\n";

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
  engine?: string;
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
  opts: { languages?: string; runner?: OcrRunner; db?: DatabaseSync; ai?: (image: Buffer, mime: string) => Promise<AiRead> } = {},
): Promise<IngestResult> {
  const db = opts.db ?? getDb();
  const stored = storeImage(buffer, db);
  if (!stored.ok) return { ok: false, name, error: stored.error };
  const { imageId, duplicateOf, mime } = stored.image;

  // The same screenshot already read once: reuse that text instead of reading it again.
  const prior = db.prepare("SELECT engine, text, confidence FROM qv_ocr WHERE image_id = ? AND status = 'ok' ORDER BY id DESC LIMIT 1").get(imageId) as
    | { engine: string; text: string; confidence: number | null }
    | undefined;
  let status: Draft["status"] = "ok";
  let engine = "tesseract";
  let confidence: number | null = null;
  let warnings: string[] = [];
  let error: string | null = null;
  let parts: { text: string; options: string[]; qtype: string }[] = [];
  let aiNote: string | null = null;

  if (prior) {
    status = "reused";
    engine = prior.engine;
    confidence = prior.confidence;
    if (prior.engine.startsWith("ai:")) parts = prior.text.split(AI_SEPARATOR).map((t) => ({ text: t, options: [], qtype: "Other" }));
    else parts = splitQuestions(prior.text).parts.map((p) => ({ ...p, qtype: guessType(p) }));
  } else {
    // 1. The vision model, when AI is configured and you have allowed it. 2. Tesseract. 3. Typing.
    const ai = await (opts.ai ?? ((b, m) => aiRead(b, m, { db })))(buffer, mime);
    if (ai.ok && ai.questions.length) {
      engine = `ai:${configuredModel()}`;
      parts = ai.questions.map((q) => ({ text: q.text, options: [], qtype: q.qtype }));
      db.prepare("INSERT INTO qv_ocr (image_id, engine, status, text, confidence, error) VALUES (?, ?, 'ok', ?, NULL, NULL)").run(imageId, engine, parts.map((p) => p.text).join(AI_SEPARATOR));
      warnings = ["Read by the AI model. It is usually right on maths, but check it against the screenshot."];
    } else {
      if (!ai.ok && ai.code !== "not_configured" && ai.code !== "no_consent" && ai.code !== "disabled") aiNote = "The AI reader failed, so Tesseract was used.";
      if (ai.ok) aiNote = "The AI reader found no question text, so Tesseract was tried.";
      const outcome = await runOcr(buffer, opts.languages ?? "eng", opts.runner ?? tesseractRunner);
      saveOcr(db, imageId, outcome);
      status = outcome.status;
      confidence = outcome.confidence;
      warnings = [...(aiNote ? [aiNote] : []), ...outcome.warnings];
      error = "error" in outcome ? outcome.error : null;
      parts = outcome.text ? splitQuestions(outcome.text).parts.map((p) => ({ ...p, qtype: guessType(p) })) : [{ text: "", options: [], qtype: "Other" }];
    }
  }
  const split = { multiple: parts.length > 1 };
  return {
    ok: true,
    draft: {
      imageId,
      duplicateOf,
      mime,
      status,
      confidence,
      warnings,
      error,
      multiple: split.multiple,
      parts,
      engine,
    },
  };
}
