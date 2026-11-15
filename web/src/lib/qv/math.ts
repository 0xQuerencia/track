/*
 * Splits text into plain and maths pieces. Maths is whatever sits between \( and \) (inline) or
 * \[ and \] (display), which is what the AI reader writes. A lone "$" is never maths (prices).
 */
export type MathPiece = { kind: "text" | "inline" | "display"; value: string };

const PATTERN = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;

export function splitMath(text: string): MathPiece[] {
  const out: MathPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { kind: "inline", value: m[1] } : { kind: "display", value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** One-line plain version for titles and lists: delimiters removed, the formula text kept. */
export const plainMath = (text: string): string => text.replace(/\\[()[\]]/g, "");

/** Shortens text for a one-line title without cutting a formula in half (an open \\( is closed). */
export function clipMath(text: string, max: number): string {
  // A one-line title shows display maths inline.
  const flat = text.replace(/\s+/g, " ").replace(/\\\[/g, "\\(").replace(/\\\]/g, "\\)");
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, max);
  const open = cut.lastIndexOf("\\(");
  if (open > cut.lastIndexOf("\\)")) cut = cut.slice(0, open).trimEnd();
  return `${cut}…`;
}
