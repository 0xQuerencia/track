import { z } from "zod";
import { isoDate } from "../dates";
import {
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  RESOURCE_KINDS,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "./constants";
import { stripControl, splitTags } from "./text";

/*
 * Input rules for every project form and server action. Values are cleaned
 * (control characters removed, trimmed) and checked before any SQL runs.
 */

const oneLine = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => stripControl(value));

const multiLine = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => stripControl(value, true));

const optional = <T extends z.ZodType>(schema: T) =>
  schema.transform((value) => (value === "" ? null : value));

const dateText = z
  .string()
  .max(10)
  .refine((value) => value === "" || isoDate(value), { message: "must be a valid date" })
  .transform((value) => (value === "" ? null : value));

const httpUrl = z
  .string()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
    message: "must be a full http(s) link",
  })
  .transform((value) => (value === "" ? null : value));

/** A comma-separated list entered in one text box, cut to sane sizes. */
const tagText = z
  .string()
  .max(2000)
  .transform((value) =>
    splitTags(stripControl(value))
      .map((tag) => tag.slice(0, 40))
      .slice(0, 20),
  );

export const projectIdSchema = z.coerce.number().int().positive();

export const projectFormSchema = z.object({
  name: oneLine(120).refine((value) => value.length > 0, { message: "Name is required." }),
  status: z.enum(PROJECT_STATUSES),
  category: optional(oneLine(80)).optional(),
  repo: httpUrl.optional(),
  local_path: optional(oneLine(500)).optional(),
  description: optional(multiLine(2000)).optional(),
  tags: tagText.optional(),
  tech_stack: tagText.optional(),
  milestone_date: dateText.optional(),
  notes: optional(multiLine(2000)).optional(),
});

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

export const taskFormSchema = z.object({
  title: oneLine(200).refine((value) => value.length > 0, { message: "Title is required." }),
  kind: z.enum(TASK_KINDS),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  due_date: dateText.optional(),
  description: optional(multiLine(2000)).optional(),
});

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const milestoneFormSchema = z.object({
  title: oneLine(200).refine((value) => value.length > 0, { message: "Title is required." }),
  due_date: dateText.optional(),
});

export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);

export const resourceFormSchema = z
  .object({
    kind: z.enum(RESOURCE_KINDS),
    title: oneLine(200).refine((value) => value.length > 0, { message: "Title is required." }),
    url_or_ref: optional(oneLine(500)).optional(),
    notes: optional(multiLine(2000)).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind !== "Link") return;
    if (!value.url_or_ref || !/^https?:\/\/\S+$/i.test(value.url_or_ref))
      context.addIssue({ code: "custom", path: ["url_or_ref"], message: "A link needs a full http(s) address." });
  });

/** Reads one FormData field as text, or "" when it is missing or not a string. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Returns the first zod issue as a message the form can show. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
