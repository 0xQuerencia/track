import { z } from "zod";
import { stripControl } from "./text";

/*
 * Versioned inventory format, version 1. Produced by a local scanner or a
 * connector; this app only reads it. Unknown keys are dropped, not stored.
 *
 * {
 *   "version": 1,
 *   "generated_at": "2026-11-15T09:00:00Z",
 *   "projects": [{ "external_id": "...", "name": "...", "git": { "remote_url": "..." } }]
 * }
 */

export const INVENTORY_VERSION = 1;
export const MAX_INVENTORY_BYTES = 2 * 1024 * 1024;
export const MAX_INVENTORY_PROJECTS = 2000;

const isIsoTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));

const line = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => stripControl(value));

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => stripControl(value, true));

const timestamp = z
  .string()
  .max(40)
  .refine(isIsoTimestamp, { message: "must be an ISO 8601 timestamp" })
  .transform((value) => value.trim());

const tagList = (maxItems: number) =>
  z.array(line(40)).max(maxItems).nullish();

export const inventoryProjectSchema = z.object({
  external_id: line(200).refine((value) => value.length > 0, {
    message: "external_id is required",
  }),
  name: line(200).refine((value) => value.length > 0, { message: "name is required" }),
  description: text(2000).nullish(),
  category: line(80).nullish(),
  tech_stack: tagList(30),
  tags: tagList(20),
  local_path: line(500).nullish(),
  git: z
    .object({
      remote_url: line(500).nullish(),
      default_branch: line(200).nullish(),
      current_branch: line(200).nullish(),
      last_commit: z
        .object({
          sha: line(64),
          message: line(500),
          at: timestamp,
        })
        .nullish(),
    })
    .nullish(),
  last_activity_at: timestamp.nullish(),
});

export type InventoryProject = z.infer<typeof inventoryProjectSchema>;

export type EnvelopeCheck =
  | { ok: true; projects: unknown[] }
  | { ok: false; message: string };

/** Checks the envelope only (version, timestamp, list size). Each project is validated on its own. */
export function checkEnvelope(value: unknown): EnvelopeCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { ok: false, message: "The inventory must be a JSON object." };
  const record = value as Record<string, unknown>;
  if (record.version !== INVENTORY_VERSION)
    return {
      ok: false,
      message: `Unsupported inventory version ${JSON.stringify(record.version ?? null)}. This app reads version ${INVENTORY_VERSION}.`,
    };
  if (typeof record.generated_at !== "string" || !isIsoTimestamp(record.generated_at))
    return { ok: false, message: "generated_at must be an ISO 8601 timestamp." };
  if (!Array.isArray(record.projects))
    return { ok: false, message: "projects must be a list." };
  if (record.projects.length > MAX_INVENTORY_PROJECTS)
    return {
      ok: false,
      message: `An inventory may hold at most ${MAX_INVENTORY_PROJECTS} projects; this one has ${record.projects.length}.`,
    };
  return { ok: true, projects: record.projects };
}
