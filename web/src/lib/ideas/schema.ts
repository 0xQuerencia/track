import { z } from "zod";
import { getEntity } from "../entities";
import { IDEA_CATEGORIES, IDEA_PRIORITIES, IDEA_STATUSES } from "../entities-ext/ideas-knowledge";
import { normalizeTags } from "../form";
import { safeHttpUrl } from "../knowledge/urls";

/*
 * Input rules for ideas and for converting an idea into a project. Every
 * stored idea field passes through here, so the table only holds validated
 * values.
 */

const MAX_TITLE = 200;
const MAX_BODY = 100_000;
const MAX_NOTE = 4000;
const MAX_LINES = 30;
const MAX_ATTACHMENT = 300;

export const splitLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .transform((text) => text.trim() || null);

const researchLinks = z
  .string()
  .max(MAX_NOTE, "Research links are too long.")
  .transform((text, ctx) => {
    const lines = splitLines(text);
    if (lines.length > MAX_LINES) {
      ctx.addIssue({ code: "custom", message: `Keep research links to ${MAX_LINES} lines.` });
      return z.NEVER;
    }
    const urls: string[] = [];
    for (const line of lines) {
      const url = safeHttpUrl(line);
      if (!url) {
        ctx.addIssue({ code: "custom", message: `Not a web address: ${line.slice(0, 60)}` });
        return z.NEVER;
      }
      urls.push(url);
    }
    return urls.length ? urls.join("\n") : null;
  });

const attachments = z
  .string()
  .max(MAX_NOTE, "Attachments list is too long.")
  .transform((text, ctx) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/[\u0000-\u001f\u007f]/g, "").trim())
      .filter(Boolean);
    if (lines.length > MAX_LINES) {
      ctx.addIssue({ code: "custom", message: `Keep attachments to ${MAX_LINES} lines.` });
      return z.NEVER;
    }
    if (lines.some((line) => line.length > MAX_ATTACHMENT)) {
      ctx.addIssue({ code: "custom", message: `Each attachment line is at most ${MAX_ATTACHMENT} characters.` });
      return z.NEVER;
    }
    return lines.length ? lines.join("\n") : null;
  });

/** Quick capture: only a title is needed. */
export const captureSchema = z.object({
  title: z
    .string()
    .transform((text) => text.trim())
    .pipe(z.string().min(1, "Write a title for the idea.").max(MAX_TITLE, `Titles are at most ${MAX_TITLE} characters.`)),
});

/** The full editable set of an idea (everything except flags and project link). */
export const ideaSchema = z.object({
  title: z
    .string()
    .transform((text) => text.trim())
    .pipe(z.string().min(1, "Give the idea a title.").max(MAX_TITLE, `Titles are at most ${MAX_TITLE} characters.`)),
  body: z
    .string()
    .max(MAX_BODY, `Bodies are at most ${MAX_BODY} characters.`)
    .transform((text) => (text.trim() ? text : null)),
  category: z.enum(IDEA_CATEGORIES, { error: "Choose a category from the list." }),
  status: z.enum(IDEA_STATUSES, { error: "Choose a status from the list." }),
  priority: z.enum(IDEA_PRIORITIES, { error: "Choose a priority from the list." }),
  tags: z
    .string()
    .max(2000)
    .transform((text) => normalizeTags(text) || null),
  research_links: researchLinks,
  attachments,
  notes: optionalText(MAX_NOTE, "Notes are too long."),
});

export type IdeaInput = z.output<typeof ideaSchema>;

const projectStatuses = (): readonly string[] =>
  getEntity("projects")?.fields.find((field) => field.name === "status")?.options ?? [];

/** The approved fields for a new project, as shown in the conversion preview. */
export const conversionSchema = z.object({
  name: z
    .string()
    .transform((text) => text.trim())
    .pipe(z.string().min(1, "The project needs a name.").max(120, "Project names are at most 120 characters.")),
  notes: optionalText(MAX_NOTE, "The description is too long."),
  repo: z
    .string()
    .max(2000)
    .transform((text, ctx) => {
      const value = text.trim();
      if (!value) return null;
      const url = safeHttpUrl(value);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "The repository must be a full http or https address." });
        return z.NEVER;
      }
      return url;
    }),
  status: z
    .string()
    .refine((value) => projectStatuses().includes(value), "Choose a project status from the list.")
    .transform((value) => value),
  milestone: optionalText(200, "The milestone is too long."),
  markBuilding: z.boolean(),
});

export type ConversionInput = z.output<typeof conversionSchema>;

/** First human-readable problem from a failed parse. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export const projectStatusOptions = (): readonly string[] => projectStatuses();
