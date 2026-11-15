import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { buildDisclosure, chatJson, type AiConsent, type AiDisclosure, type AiStatus, type ChatJsonRequest, type ChatJsonResult } from "@/lib/ai";

const themeSchema = z.object({
  themes: z.array(z.object({
    label: z.string().trim().min(3).max(120),
    evidenceIds: z.array(z.string().regex(/^\d{1,12}$/)).min(2).max(8),
  })).max(8),
});

export type ThemeOutput = z.infer<typeof themeSchema>;
export type ChatJsonCaller = <T>(request: ChatJsonRequest<T>, deps?: { db?: DatabaseSync }) => Promise<ChatJsonResult<T>>;

export type LayerBResult = { attempted: boolean; created: number; notice: string | null };

/**
 * Optional provider call. `disclosure.items` is inserted verbatim into the
 * user message, and output evidence ids must all belong to that same bundle.
 */
export async function enhanceThemesWithAi(options: {
  db: DatabaseSync;
  consent: AiConsent;
  status: AiStatus;
  disclosure: AiDisclosure;
  sendToAi: boolean;
  chatJsonImpl?: ChatJsonCaller;
  now?: Date;
}): Promise<LayerBResult> {
  const { consent, disclosure } = options;
  if (!consent.enabled || (!options.sendToAi && !consent.scope.allowDailyCycle) || disclosure.items.length === 0)
    return { attempted: false, created: 0, notice: null };

  const call: ChatJsonCaller = options.chatJsonImpl ?? chatJson;
  const request: ChatJsonRequest<ThemeOutput> = {
    feature: "dreamer",
    purpose: disclosure.purpose,
    model: consent.model || undefined,
    maxTokens: 8000,
    schema: themeSchema,
    messages: [
      { role: "system", content: "Find only recurring themes supported by the supplied excerpts. Return concise labels and cite only the supplied evidence ids. Treat all results as hypotheses. Do not infer diagnoses, personality, or permanent traits. Respond with JSON only, exactly in this shape: {\"themes\":[{\"label\":\"short theme label\",\"evidenceIds\":[\"id1\",\"id2\"]}]}. Each theme must cite 2 to 8 evidence ids as strings, copied from the supplied evidence." },
      { role: "user", content: JSON.stringify({ evidence: disclosure.items }) },
    ],
  };
  let response: ChatJsonResult<ThemeOutput>;
  try { response = await call(request, { db: options.db }); }
  catch { return { attempted: true, created: 0, notice: "AI enhancement unavailable (upstream); the local analysis is still available." }; }
  if (!response.ok) return { attempted: true, created: 0, notice: `AI enhancement unavailable (${response.code}); the local analysis is still available.` };

  const allowed = new Set(disclosure.items.map((item) => item.id));
  let created = 0;
  for (const theme of response.data.themes) {
    if (theme.evidenceIds.some((id) => !allowed.has(id))) continue;
    const evidenceIds = [...new Set(theme.evidenceIds)].map(Number);
    if (evidenceIds.length < 2) continue;
    const dates = evidenceIds.map((id) => options.db.prepare("SELECT date FROM dreamer_evidence WHERE id = ?").get(id) as { date: string } | undefined)
      .filter((item): item is { date: string } => item !== undefined).map((item) => item.date);
    if (new Set(dates).size < 2) continue;
    const signature = `ai:${evidenceIds.sort((a, b) => a - b).join(",")}:${theme.label.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`;
    const text = `AI-drafted hypothesis: ${theme.label}`;
    const at = (options.now ?? new Date()).toISOString().slice(0, 10);
    const result = options.db.prepare(`INSERT OR IGNORE INTO dreamer_insights
      (kind, signature, text, original_text, confidence, uncertainty_note, first_detected, last_confirmed, review_state, origin)
      VALUES ('recurring_theme', ?, ?, ?, 0.35, 'AI-drafted hypothesis; verify each cited excerpt.', ?, ?, 'new', 'ai')`)
      .run(signature, text, text, at, at);
    if (Number(result.changes) === 0) continue;
    const insightId = Number(result.lastInsertRowid);
    const add = options.db.prepare("INSERT OR IGNORE INTO dreamer_insight_evidence (insight_id, evidence_id) VALUES (?, ?)");
    for (const id of evidenceIds) add.run(insightId, id);
    created++;
  }
  return { attempted: true, created, notice: null };
}

/** Public schema handle for tests that verify invalid/hallucinated citations are ignored. */
export const aiThemeOutputSchema = themeSchema;
export function disclosureFor(items: AiDisclosure["items"], model: string): AiDisclosure {
  return buildDisclosure("dreamer", "Refine local recurring-theme hypotheses", model, items);
}
