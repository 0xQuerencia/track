"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getConsent, setConsent } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { insertRow } from "@/lib/crud";
import { addLink } from "@/lib/links";
import { convertIdeaToProject } from "@/lib/ideas/convert";
import { projectStatusOptions } from "@/lib/ideas/schema";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { deleteAllDreamerData, runDailyCycle, runWeeklyReflection } from "@/lib/dreamer/cycle";
import { getAiDisclosurePreview } from "@/lib/dreamer/queries";
import { recordSuggestionFeedback, removeSourceData, setEntryEnabled, setExcludedValues, setSourceSetting } from "@/lib/dreamer/engine";
import type { DreamerFeedback, DreamerSource } from "@/lib/dreamer/types";

const idSchema = z.number().int().positive();
const sourceSchema = z.enum(["journal", "note", "idea"]);
const feedbackSchema = z.enum(["useful", "save_later", "explore", "convert_to_project", "already_implemented", "not_relevant", "dont_suggest_again"]);
const stateSchema = z.enum(["accepted", "corrected", "dismissed", "outdated", "blocked"]);

async function allowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
  return verifyOriginHeaders(await headers()).ok;
}

function refresh() {
  revalidatePath("/dreamer");
  revalidatePath("/");
}

export async function runDreamerAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const sendToAi = formData.get("send_to_ai") === "on";
  const db = getDb();
  let approvedDisclosure: ReturnType<typeof getAiDisclosurePreview> | undefined;
  let disclosureMismatch = false;
  if (sendToAi) {
    let submitted: unknown;
    try { submitted = JSON.parse(String(formData.get("disclosure_items") ?? "[]")); }
    catch { submitted = null; }
    const parsed = z.array(z.object({ id: z.string().regex(/^\d{1,12}$/), label: z.string().max(120), text: z.string().max(1000) })).max(8)
      .safeParse(submitted);
    if (parsed.success) {
      const current = getAiDisclosurePreview(db, parsed.data.map((item) => item.id));
      if (JSON.stringify(current.items) === JSON.stringify(parsed.data)) approvedDisclosure = current;
      else disclosureMismatch = true;
    } else disclosureMismatch = true;
  }
  await runDailyCycle(db, new Date(), {
    force: true,
    sendToAi: sendToAi && Boolean(approvedDisclosure?.items.length),
    approvedDisclosure,
    disclosureMismatch,
  });
  refresh();
}

export async function runWeeklyReflectionAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const requested = String(formData.get("week_start") ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : new Date().toISOString().slice(0, 10);
  runWeeklyReflection(getDb(), date);
  refresh();
}

export async function setSourceEnabledAction(sourceValue: string, enabled: boolean): Promise<void> {
  if (!(await allowed())) return;
  const source = sourceSchema.safeParse(sourceValue);
  if (!source.success) return;
  setSourceSetting(getDb(), source.data, enabled === true);
  refresh();
}

export async function setEntryEnabledAction(sourceValue: string, refIdValue: string, enabled: boolean): Promise<void> {
  if (!(await allowed())) return;
  const source = sourceSchema.safeParse(sourceValue);
  const refId = z.string().regex(/^\d{1,12}$/).safeParse(refIdValue);
  if (!source.success || !refId.success) return;
  if (enabled) setEntryEnabled(getDb(), source.data, refId.data, true);
  else removeSourceData(getDb(), source.data, refId.data);
  refresh();
}

export async function saveExclusionsAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const tags = formData.getAll("excluded_tags").filter((value): value is string => typeof value === "string").slice(0, 500);
  const categories = formData.getAll("excluded_categories").filter((value): value is string => typeof value === "string").slice(0, 200);
  setExcludedValues(getDb(), "tags", tags);
  setExcludedValues(getDb(), "categories", categories);
  refresh();
}

export async function setDreamerConsentAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const enabled = formData.get("enabled") === "on";
  const allowDailyCycle = enabled && formData.get("allow_daily") === "on";
  const previous = getConsent(getDb(), "dreamer");
  setConsent(getDb(), "dreamer", enabled, {
    allowDailyCycle,
    maxExcerptChars: Math.max(80, Math.min(1000, previous.scope.maxExcerptChars || 280)),
  });
  refresh();
}

export async function reviewInsightAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const id = idSchema.safeParse(Number(formData.get("id")));
  const action = String(formData.get("action") ?? "");
  if (!id.success) return;
  const db = getDb();
  const row = db.prepare("SELECT id FROM dreamer_insights WHERE id = ?").get(id.data);
  if (!row) return;
  if (action === "delete") {
    const evidence = db.prepare("SELECT evidence_id FROM dreamer_insight_evidence WHERE insight_id = ?").all(id.data) as { evidence_id: number }[];
    db.prepare("DELETE FROM dreamer_insights WHERE id = ?").run(id.data);
    db.prepare("DELETE FROM dreamer_briefs").run();
    for (const item of evidence) {
      const used = db.prepare(`SELECT 1 FROM dreamer_insight_evidence WHERE evidence_id = ?
        UNION SELECT 1 FROM dreamer_suggestion_evidence WHERE evidence_id = ? LIMIT 1`).get(item.evidence_id, item.evidence_id);
      if (!used) db.prepare("DELETE FROM dreamer_evidence WHERE id = ?").run(item.evidence_id);
    }
  } else {
    const state = stateSchema.safeParse(action);
    if (!state.success) return;
    const text = String(formData.get("user_text") ?? "").trim().slice(0, 3000);
    if (state.data === "corrected" && !text) return;
    db.prepare(`UPDATE dreamer_insights SET review_state = ?, user_text = CASE WHEN ? = 'corrected' THEN ? ELSE user_text END,
      last_confirmed = date('now') WHERE id = ?`).run(state.data, state.data, text, id.data);
  }
  refresh();
}

export async function feedbackSuggestionAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const id = idSchema.safeParse(Number(formData.get("id")));
  const choice = feedbackSchema.safeParse(String(formData.get("choice") ?? ""));
  if (!id.success || !choice.success) return;
  const db = getDb();
  const suggestion = db.prepare(`SELECT id, title, problem, why_it_matters, usefulness, difficulty,
    dependencies, prototype, next_steps, uncertainties FROM dreamer_suggestions WHERE id = ?`).get(id.data) as
    | { id: number; title: string; problem: string; why_it_matters: string; usefulness: string; difficulty: string; dependencies: string; prototype: string; next_steps: string; uncertainties: string }
    | undefined;
  if (!suggestion) return;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!recordSuggestionFeedback(db, id.data, choice.data, note)) return;

  if (choice.data === "convert_to_project") {
    const duplicate = db.prepare("SELECT id FROM projects WHERE lower(trim(name)) = lower(trim(?)) AND archived = 0 ORDER BY id LIMIT 1")
      .get(suggestion.title) as { id: number } | undefined;
    const related = db.prepare("SELECT project_id FROM dreamer_suggestion_projects WHERE suggestion_id = ? ORDER BY project_id LIMIT 1")
      .get(id.data) as { project_id: number } | undefined;
    const ideaId = insertRow("ideas", {
      title: suggestion.title.slice(0, 200),
      body: [suggestion.problem, `Why it matters: ${suggestion.why_it_matters}`, `Useful because: ${suggestion.usefulness}`, `Prototype: ${suggestion.prototype}`, `Next steps:\n${suggestion.next_steps}`, `Uncertainties: ${suggestion.uncertainties}`].join("\n\n"),
      category: "Personal", status: "Planned", priority: "Medium", tags: "Dreamer",
      pinned: 0, archived: 0, research_links: null, attachments: null, notes: "Created from an evidence-backed Dreamer proposal.", project_id: null,
    });
    const inspirations = db.prepare(`SELECT DISTINCT e.source, e.ref_id FROM dreamer_suggestion_evidence se
      JOIN dreamer_evidence e ON e.id = se.evidence_id WHERE se.suggestion_id = ?`).all(id.data) as { source: string; ref_id: string }[];
    const sourceTypes: Record<string, string> = { journal: "journal_entries", note: "notes", idea: "ideas" };
    for (const source of inspirations) {
      const type = sourceTypes[source.source];
      if (type) addLink({ from: { type, id: source.ref_id }, to: { type: "ideas", id: String(ideaId) }, relation: "related" });
    }
    const status = projectStatusOptions()[0] ?? "Active";
    const converted = convertIdeaToProject({
      ideaId, name: suggestion.title.slice(0, 120), notes: suggestion.problem.slice(0, 4000),
      repo: null, status, milestone: "Try the smallest practical prototype", markBuilding: false,
      linkExistingProjectId: related?.project_id ?? duplicate?.id ?? null,
    });
    if (!converted.ok) db.prepare("UPDATE dreamer_suggestions SET state = 'new' WHERE id = ?").run(id.data);
  }
  refresh();
}

export async function updateGraphLinkAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const id = idSchema.safeParse(Number(formData.get("id")));
  const state = z.enum(["confirmed", "rejected", "proposed"]).safeParse(String(formData.get("state") ?? ""));
  if (!id.success || !state.success) return;
  getDb().prepare("UPDATE dreamer_links SET state = ? WHERE id = ?").run(state.data, id.data);
  refresh();
}

export async function deleteAllDreamerAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  if (String(formData.get("confirm") ?? "") !== "DELETE") return;
  deleteAllDreamerData(getDb());
  refresh();
}

export async function setEntryExcludedFormAction(formData: FormData): Promise<void> {
  const source = String(formData.get("source") ?? "");
  const refId = String(formData.get("ref_id") ?? "");
  await setEntryEnabledAction(source, refId, formData.get("enabled") === "on");
}

export type { DreamerFeedback, DreamerSource };
