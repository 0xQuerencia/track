import { z } from "zod";
import { NOTE_KINDS } from "../entities-ext/ideas-knowledge";
import { normalizeTags } from "../form";
import { safeHttpUrl } from "./urls";

/*
 * Input rules for notes, bookmarks and collections. Server actions parse
 * FormData with these, so every stored value has passed one of them.
 */

const MAX_TITLE = 200;
const MAX_BODY = 100_000;
const MAX_SHORT = 500;
const MAX_TAGS = 2000;
const collectionIdField = z
  .string()
  .max(12)
  .regex(/^\d*$/, "Collection is not valid.")
  .transform((text) => (text ? Number(text) : null));
const tagsField = z
  .string()
  .max(MAX_TAGS)
  .transform((text) => normalizeTags(text) || null);
const optionalShort = (max: number) =>
  z
    .string()
    .max(max)
    .transform((text) => text.trim() || null);

export const noteSchema = z.object({
  title: z
    .string()
    .transform((text) => text.trim())
    .pipe(z.string().min(1, "Give the note a title.").max(MAX_TITLE, `Titles are at most ${MAX_TITLE} characters.`)),
  kind: z.enum(NOTE_KINDS, { error: "Choose a kind from the list." }),
  collection_id: collectionIdField,
  tags: tagsField,
  pinned: z.boolean(),
  body: z
    .string()
    .max(MAX_BODY, `Notes are at most ${MAX_BODY} characters.`)
    .transform((text) => (text.trim() ? text : null)),
});

export type NoteInput = z.output<typeof noteSchema>;

export const bookmarkSchema = z.object({
  url: z
    .string()
    .transform((text) => text.trim())
    .transform((text, ctx) => {
      const url = safeHttpUrl(text);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "Enter a full http or https address." });
        return z.NEVER;
      }
      return url;
    }),
  title: optionalShort(MAX_TITLE),
  description: optionalShort(MAX_SHORT),
  tags: tagsField,
  collection_id: collectionIdField,
  pinned: z.boolean(),
});

export type BookmarkInput = z.output<typeof bookmarkSchema>;

export const collectionSchema = z.object({
  name: z
    .string()
    .transform((text) => text.trim())
    .pipe(z.string().min(1, "Give the collection a name.").max(80, "Names are at most 80 characters.")),
  description: optionalShort(MAX_SHORT),
});

export type CollectionInput = z.output<typeof collectionSchema>;

/** First human-readable problem from a failed parse. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
