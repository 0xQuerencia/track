import { execFile } from "node:child_process";

/*
 * OCR through the open-source Tesseract binary (no paid API). Tesseract reads
 * printed text well and mathematics poorly, so the result always carries
 * warnings and a confidence, and the screenshot stays beside the text for the
 * user to check. Nothing here invents text: if the engine fails the question is
 * saved from the screenshot and typed text only.
 */

export type OcrOutcome =
  | { status: "ok"; text: string; confidence: number; warnings: string[] }
  | { status: "empty" | "failed" | "unavailable"; text: ""; confidence: null; warnings: string[]; error: string };

export type OcrRunner = (args: string[], input: Buffer) => Promise<string>;

const TIMEOUT_MS = 60_000;
export const LANG_PATTERN = /^[a-z_]{3,12}(\+[a-z_]{3,12}){0,3}$/;

export const tesseractRunner: OcrRunner = (args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile("tesseract", args, { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(input);
  });

export async function installedLanguages(runner: OcrRunner = tesseractRunner): Promise<string[]> {
  try {
    const out = await runner(["--list-langs"], Buffer.alloc(0));
    return out.split("\n").slice(1).map((l) => l.trim()).filter((l) => l && l !== "osd");
  } catch {
    return [];
  }
}

/** Rebuilds line-ordered text and a mean word confidence from Tesseract's TSV output. */
export function parseTsv(tsv: string): { text: string; confidence: number | null } {
  const lines = new Map<string, string[]>();
  let total = 0;
  let count = 0;
  for (const row of tsv.split("\n").slice(1)) {
    const c = row.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const word = c.slice(11).join("\t").trim();
    const conf = Number(c[10]);
    if (!word) continue;
    const key = `${c[2]}-${c[3]}-${c[4]}`;
    lines.set(key, [...(lines.get(key) ?? []), word]);
    if (conf >= 0) {
      total += conf;
      count += 1;
    }
  }
  const text = [...lines.values()].map((words) => words.join(" ")).join("\n");
  return { text, confidence: count ? Math.round(total / count) : null };
}

/** Honest hints about what this engine is likely to have gotten wrong. */
export function ocrWarnings(text: string, confidence: number | null): string[] {
  const warnings: string[] = [];
  if (confidence !== null && confidence < 70) warnings.push(`Low OCR confidence (${confidence}%). Check the text against the screenshot.`);
  const symbols = (text.match(/[^\p{L}\p{N}\s.,;:'"()\-+=/?!%]/gu) ?? []).length;
  if (/[=+\-/^√∫∑∂]|\b(sin|cos|tan|log|lim)\b/i.test(text) || symbols > 3)
    warnings.push("Equations, fractions and special symbols are often misread by OCR. Verify them against the screenshot.");
  if (/\b[a-z]\s?[_^]\s?\d/i.test(text)) warnings.push("Subscripts and superscripts may have been flattened.");
  return warnings;
}

export async function runOcr(image: Buffer, languages = "eng", runner: OcrRunner = tesseractRunner): Promise<OcrOutcome> {
  if (!LANG_PATTERN.test(languages)) return { status: "failed", text: "", confidence: null, warnings: [], error: "Unsupported language selection." };
  try {
    const tsv = await runner(["stdin", "stdout", "-l", languages, "--psm", "6", "--dpi", "300", "tsv"], image);
    const { text, confidence } = parseTsv(tsv);
    if (!text.trim()) return { status: "empty", text: "", confidence: null, warnings: [], error: "No text was found in the image. Type the question instead." };
    return { status: "ok", text, confidence: confidence ?? 0, warnings: ocrWarnings(text, confidence) };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException)?.code === "ENOENT";
    return {
      status: missing ? "unavailable" : "failed",
      text: "",
      confidence: null,
      warnings: [],
      error: missing ? "Tesseract is not installed on the server. Type the question; the screenshot is still saved." : "The OCR engine failed on this image. Type the question; the screenshot is still saved.",
    };
  }
}

/* ---------- splitting a screenshot into questions ---------- */

export type QuestionPart = { text: string; options: string[] };

const START = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.)]\s+\S/i;
const OPTION = /^\s*\(?([A-Da-d]|[1-4])[.)]\s+\S/;

/** Finds `1.`, `2.`, `Q3)` style starts. Two or more increasing numbers mean more than one question. */
export function splitQuestions(text: string): { multiple: boolean; parts: QuestionPart[] } {
  const lines = text.replace(/\r/g, "").split("\n");
  const starts: number[] = [];
  let last = 0;
  lines.forEach((line, i) => {
    const m = START.exec(line);
    if (!m) return;
    const n = Number(m[1]);
    // Option lines like "1) text" inside a question must not count as a new question.
    if (n === last + 1 || (starts.length === 0 && n >= 1)) {
      starts.push(i);
      last = n;
    }
  });
  const toPart = (chunk: string[]): QuestionPart => {
    const body = chunk.join("\n").trim();
    return { text: body, options: chunk.slice(1).filter((l) => OPTION.test(l)).map((l) => l.trim()) };
  };
  // "1) ... 2) ... 3) ..." under a stem is an option list, not several questions.
  const looksLikeOptions = starts.length <= 4 && starts[0] > 0;
  if (starts.length < 2 || looksLikeOptions) return { multiple: false, parts: [toPart(lines)] };
  const parts = starts.map((s, i) => toPart(lines.slice(s, starts[i + 1] ?? lines.length))).filter((p) => p.text);
  return { multiple: parts.length > 1, parts };
}

/** MCQ when there are at least three lettered or numbered options; otherwise left for the user. */
export function guessType(part: QuestionPart): string {
  return part.options.length >= 3 ? "MCQ" : "Other";
}
