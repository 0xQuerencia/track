import type { Entity } from "../entities";

/*
 * Ideas and knowledge record types. Type-only import from ../entities, so this
 * file stays free of runtime imports (entities.ts imports it back).
 */

export const IDEA_CATEGORIES = [
  "Software",
  "Dev tools",
  "Linux",
  "AI",
  "Hardware",
  "Robotics",
  "Games",
  "Business",
  "Invention",
  "Personal",
  "Creative",
  "Random",
] as const;

export const IDEA_STATUSES = [
  "Inbox",
  "Exploring",
  "Planned",
  "Building",
  "Completed",
  "Shelved",
] as const;

export const IDEA_PRIORITIES = ["High", "Medium", "Low"] as const;

export const NOTE_KINDS = ["Note", "Reference", "Research", "Snippet"] as const;

export const ENTITIES: readonly Entity[] = [
  {
    key: "ideas",
    singular: "Idea",
    plural: "Ideas",
    href: "/ideas",
    detailHref: "/ideas/{id}",
    orderBy: "pinned DESC, updated_at DESC, id DESC",
    titleField: "title",
    searchable: ["title", "body", "tags"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "body", label: "Body", type: "markdown" },
      { name: "category", label: "Category", type: "select", options: IDEA_CATEGORIES, default: "Random" },
      { name: "status", label: "Status", type: "select", options: IDEA_STATUSES, default: "Inbox" },
      { name: "priority", label: "Priority", type: "select", options: IDEA_PRIORITIES, default: "Medium" },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "pinned", label: "Pinned", type: "boolean" },
      { name: "archived", label: "Archived", type: "boolean" },
      { name: "research_links", label: "Research links", type: "textarea" },
      { name: "attachments", label: "Attachments", type: "textarea" },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "project_id", label: "Project", type: "number", min: 1 },
    ],
  },
  {
    key: "notes",
    singular: "Note",
    plural: "Notes",
    href: "/knowledge",
    detailHref: "/knowledge/{id}",
    orderBy: "pinned DESC, updated_at DESC, id DESC",
    titleField: "title",
    searchable: ["title", "body", "tags"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "kind", label: "Kind", type: "select", options: NOTE_KINDS, default: "Note" },
      { name: "collection_id", label: "Collection", type: "number", min: 1 },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "pinned", label: "Pinned", type: "boolean" },
      { name: "body", label: "Body", type: "markdown" },
    ],
  },
  {
    key: "collections",
    singular: "Collection",
    plural: "Collections",
    href: "/knowledge?tab=collections",
    orderBy: "name COLLATE NOCASE, id",
    titleField: "name",
    searchable: ["name", "description"],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    key: "bookmarks",
    singular: "Bookmark",
    plural: "Bookmarks",
    href: "/knowledge?tab=bookmarks",
    orderBy: "pinned DESC, saved_at DESC, id DESC",
    titleField: "title",
    searchable: ["title", "url", "description", "tags"],
    fields: [
      { name: "url", label: "URL", type: "url", required: true },
      { name: "title", label: "Title", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "collection_id", label: "Collection", type: "number", min: 1 },
      { name: "pinned", label: "Pinned", type: "boolean" },
    ],
  },
];
