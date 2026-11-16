import type { Entity } from "../entities";
import {
  ASSIGNMENT_STATUSES,
  MOCK_KINDS,
  RESOURCE_KINDS,
  STUDY_SUBJECTS,
} from "../study/options";

/*
 * Record types for the study module. Tables are created by migration m060.
 * This file imports nothing that imports entities.ts (see entities-ext/index.ts).
 * The chapter_id fields hold chapters.id; the study forms offer a chapter
 * picker and the server checks that the chapter exists.
 */
const today = "today" as const;

export const ENTITIES: readonly Entity[] = [
  {
    key: "mock_tests",
    singular: "Mock test",
    plural: "Mock tests",
    href: "/study",
    orderBy: "date DESC, id DESC",
    titleField: "name",
    searchable: ["name", "notes"],
    fields: [
      { name: "date", label: "Date", type: "date", required: true, default: today },
      { name: "name", label: "Test", type: "text", required: true },
      { name: "kind", label: "Kind", type: "select", options: MOCK_KINDS },
      {
        name: "total_marks",
        label: "Total marks",
        type: "number",
        required: true,
        min: 1,
        max: 2000,
      },
      { name: "scored", label: "Scored", type: "number", required: true, min: 0, max: 2000 },
      { name: "physics", label: "Physics marks", type: "number", min: 0, max: 2000 },
      { name: "chemistry", label: "Chemistry marks", type: "number", min: 0, max: 2000 },
      { name: "maths", label: "Maths marks", type: "number", min: 0, max: 2000 },
      { name: "duration_min", label: "Duration (min)", type: "number", min: 1, max: 1440 },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "question_stats",
    singular: "Question log",
    plural: "Question log",
    href: "/study",
    orderBy: "date DESC, id DESC",
    titleField: "source",
    searchable: ["source"],
    fields: [
      { name: "date", label: "Date", type: "date", required: true, default: today },
      {
        name: "subject",
        label: "Subject",
        type: "select",
        options: STUDY_SUBJECTS,
        required: true,
      },
      { name: "chapter_id", label: "Chapter", type: "number", min: 1 },
      {
        name: "attempted",
        label: "Attempted",
        type: "number",
        required: true,
        min: 1,
        max: 5000,
      },
      { name: "correct", label: "Correct", type: "number", min: 0, max: 5000, default: 0 },
      { name: "source", label: "Source", type: "text" },
    ],
  },
  {
    key: "assignments",
    singular: "Assignment",
    plural: "Assignments",
    href: "/study",
    orderBy: "CASE status WHEN 'Doing' THEN 0 WHEN 'Todo' THEN 1 ELSE 2 END, due_date IS NULL, due_date, id",
    titleField: "title",
    searchable: ["title", "notes"],
    fields: [
      { name: "title", label: "Assignment", type: "text", required: true },
      { name: "subject", label: "Subject", type: "select", options: STUDY_SUBJECTS },
      { name: "due_date", label: "Due", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ASSIGNMENT_STATUSES,
        default: "Todo",
      },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "study_resources",
    singular: "Resource",
    plural: "Resources",
    href: "/study",
    orderBy: "subject, id DESC",
    titleField: "title",
    searchable: ["title"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "url", label: "Link", type: "url" },
      { name: "subject", label: "Subject", type: "select", options: STUDY_SUBJECTS },
      { name: "chapter_id", label: "Chapter", type: "number", min: 1 },
      { name: "kind", label: "Kind", type: "select", options: RESOURCE_KINDS, default: "Book" },
    ],
  },
];
