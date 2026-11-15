import type { Entity } from "../entities";
import { OPPORTUNITY_KINDS, OPPORTUNITY_PRIORITIES, OPPORTUNITY_STATUSES } from "../career/constants";
import { DOCUMENT_CATEGORIES } from "../documents/constants";
import { IMPORTANT_DATE_KINDS } from "../people/constants";

/*
 * Record types for career, people and documents. Tables are created by
 * migration m080, and every column named here must exist there.
 *
 * Generic create and edit paths can write these rows, so the schema enforces
 * shape (date and birthday GLOB checks, the career history triggers, the
 * documents file_key check). Pages use their own actions for validation that
 * SQL cannot express, and for side effects such as deleting a stored file.
 */

export const ENTITIES: readonly Entity[] = [
  {
    key: "opportunities",
    singular: "Opportunity",
    plural: "Opportunities",
    href: "/career",
    orderBy:
      "deadline IS NULL, deadline, CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, id DESC",
    titleField: "title",
    searchable: ["title", "org", "notes"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "org", label: "Organisation", type: "text" },
      { name: "kind", label: "Kind", type: "select", options: OPPORTUNITY_KINDS, default: "Other" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: OPPORTUNITY_STATUSES,
        default: "Interested",
      },
      { name: "deadline", label: "Deadline", type: "date" },
      { name: "url", label: "Link", type: "url" },
      { name: "notes", label: "Notes", type: "textarea" },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        options: OPPORTUNITY_PRIORITIES,
        default: "Medium",
      },
      { name: "achieved_on", label: "Achieved on", type: "date" },
    ],
  },
  {
    key: "people",
    singular: "Person",
    plural: "People",
    href: "/people",
    orderBy: "name COLLATE NOCASE, id",
    titleField: "name",
    searchable: ["name", "relationship", "notes", "tags"],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "relationship", label: "Relationship", type: "text" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "birthday", label: "Birthday (MM-DD or YYYY-MM-DD)", type: "text" },
      { name: "last_contacted", label: "Last contacted", type: "date" },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "important_dates",
    singular: "Important date",
    plural: "Important dates",
    href: "/people",
    orderBy: "date, id",
    titleField: "title",
    searchable: ["title"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "person_id", label: "Person", type: "number", min: 1 },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        options: IMPORTANT_DATE_KINDS,
        default: "Other",
      },
      { name: "repeat_yearly", label: "Repeats yearly", type: "boolean" },
      {
        name: "remind_days_before",
        label: "Remind days before",
        type: "number",
        min: 0,
        max: 365,
      },
    ],
  },
  {
    key: "documents",
    singular: "Document",
    plural: "Documents",
    href: "/documents",
    orderBy: "title COLLATE NOCASE, id",
    titleField: "title",
    searchable: ["title", "tags", "notes"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: DOCUMENT_CATEGORIES,
        default: "Other",
      },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "issued_on", label: "Issued on", type: "date" },
      { name: "expires_on", label: "Expires on", type: "date" },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "file_name", label: "File name", type: "text" },
      { name: "file_mime", label: "File type", type: "text" },
      { name: "file_size", label: "File size (bytes)", type: "number", min: 0 },
      { name: "file_key", label: "Storage key", type: "text" },
      { name: "checksum", label: "SHA-256", type: "text" },
    ],
  },
];
