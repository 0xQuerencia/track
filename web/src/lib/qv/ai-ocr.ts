import { z } from "zod";
import { chatJson } from "../ai";
import type { AiErrorCode } from "../ai";
import { QUESTION_TYPES } from "./constants";

/*
 * Reads a screenshot with the configured vision model (the same router as the rest of Track).
 * It sees only the image and a fixed instruction. It must transcribe, never solve: answers and
 * solutions are not requested, so nothing can be invented into those fields.
 */

const schema = z.object({
  questions: z
    .array(z.object({ text: z.string().max(8000), type: z.string().max(40).optional() }))
    .max(40),
});

export type AiRead = { ok: true; questions: { text: string; qtype: string }[] } | { ok: false; code: AiErrorCode };

const INSTRUCTION = `Transcribe every question visible in this image, exactly as written. Do not solve, answer, explain or correct anything.
Keep options (A)(B)(C)(D) with their question. Write mathematics, chemistry and physics notation in LaTeX between \\( and \\).
If the image holds several numbered questions, return each separately. If it holds no question, return an empty list.
Reply as JSON: {"questions":[{"text":"...","type":"MCQ|Multi-correct|Numerical|Integer|Subjective|Assertion-Reason|Match|Other"}]}`;

export async function aiRead(image: Buffer, mime: string, deps: Parameters<typeof chatJson>[1] = {}): Promise<AiRead> {
  const result = await chatJson(
    {
      feature: "vault",
      purpose: "Read the text of a question screenshot you added",
      effort: "low",
      maxTokens: 6000,
      schema,
      messages: [
        { role: "user", content: [{ type: "text", text: INSTRUCTION }, { type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}` } }] },
      ],
    },
    deps,
  );
  if (!result.ok) return { ok: false, code: result.code };
  return {
    ok: true,
    questions: result.data.questions
      .map((q) => ({ text: q.text.trim(), qtype: (QUESTION_TYPES as readonly string[]).includes(q.type ?? "") ? (q.type as string) : "Other" }))
      .filter((q) => q.text),
  };
}
