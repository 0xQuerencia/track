import { z } from "zod";
import { getEntity, type Entity } from "@/lib/entities";

/*
 * What the assistant may touch. Entities and field names come from the app's own
 * definitions (src/lib/entities.ts), so the model can only use columns and select
 * options that the manual forms already accept. Files and infrastructure records
 * (documents, devices, services) are deliberately not on this list.
 */
export const ASSISTANT_ENTITIES = [
  "tasks", "events", "notes", "ideas", "journal_entries", "habits", "goals",
  "health_logs", "workouts", "hydration_logs", "nutrition_notes", "screen_logs",
  "study_sessions", "focus_sessions", "mistakes", "exams", "assignments",
  "transactions", "savings_goals", "media_items", "people", "important_dates",
  "project_items", "bookmarks", "opportunities",
] as const;
export type AssistantEntity = (typeof ASSISTANT_ENTITIES)[number];

export const MAX_ACTIONS = 8;

const fieldValue = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);
const fields = z.record(z.string().max(60), fieldValue);
const entity = z.enum(ASSISTANT_ENTITIES);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_record"), entity, fields }),
  z.object({ type: z.literal("update_record"), entity, id: z.number().int().positive(), fields }),
  z.object({ type: z.literal("delete_record"), entity, id: z.number().int().positive() }),
  z.object({
    type: z.literal("log_weight"),
    weight_kg: z.number().min(20).max(400),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  }),
]);
export type AssistantAction = z.infer<typeof actionSchema>;

/** Actions are validated one by one afterwards, so one bad action never discards the whole reply. */
export const planSchema = z.object({
  // A reply that contains action syntax means the model broke the JSON shape; reject so it is retried.
  reply: z.string().trim().min(1).max(700).refine((text) => !/["']actions["']\s*:|\{\s*["']type["']|\bJSON\b/i.test(text), "malformed reply"),
  actions: z.array(z.unknown()).max(MAX_ACTIONS).nullish().transform((v) => v ?? []),
});
export type AssistantPlan = { reply: string; actions: AssistantAction[]; dropped: number };

export function validPlan(plan: z.infer<typeof planSchema>): AssistantPlan {
  const actions: AssistantAction[] = [];
  for (const candidate of plan.actions) {
    const parsed = actionSchema.safeParse(candidate);
    if (parsed.success) actions.push(parsed.data);
  }
  return { reply: plan.reply, actions, dropped: plan.actions.length - actions.length };
}

/** Destructive actions are never applied without an explicit click. */
export function needsConfirmation(action: AssistantAction): boolean {
  return action.type === "delete_record";
}

export function entityOf(key: string): Entity | undefined {
  return (ASSISTANT_ENTITIES as readonly string[]).includes(key) ? getEntity(key) : undefined;
}

/** Compact schema text for the prompt, derived from the real entity definitions. */
export function describeEntities(): string {
  return ASSISTANT_ENTITIES.map((key) => {
    const e = getEntity(key);
    if (!e) return "";
    const f = e.fields
      .filter((x) => !/(^id$|_id$|file_|checksum|attachments|last_)/.test(x.name))
      .map((x) => {
        const bits = [x.name + (x.required ? "*" : "")];
        if (x.type === "select" && x.options) bits.push(`(${x.options.join("|")})`);
        else if (x.type === "date") bits.push("(YYYY-MM-DD)");
        else if (x.type === "boolean") bits.push("(true|false)");
        return bits.join("");
      })
      .join(", ");
    return `${key}: ${f}`;
  }).filter(Boolean).join("\n");
}
