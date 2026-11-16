/**
 * Every tracked record type is defined once here. The database schema, the
 * add-forms, validation and search all derive from these definitions, so a
 * column name or select option can only come from this file, never from a
 * request.
 */
import { EXTENSION_ENTITIES } from "./entities-ext";

export type FieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "tags"
  | "number"
  | "date"
  | "select"
  | "url"
  | "boolean";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required?: boolean;
  default?: string | number;
  min?: number;
  max?: number;
  step?: number;
};

export type Entity = {
  key: string;
  singular: string;
  plural: string;
  fields: readonly Field[];
  /** A fixed ORDER BY clause written in code, never built from input. */
  orderBy: string;
  /** Field shown as the record's title in search results. */
  titleField: string;
  /** Text fields included in universal search. */
  searchable: readonly string[];
  /** Page the record lives on, for search result links. */
  href: string;
  /** Optional per-record page, with "{id}" standing for the row id. Falls back to href#key-id. */
  detailHref?: string;
};

/** Link to one record: its detail page when the entity has one, else the list anchor. */
export function entityRecordHref(entity: Entity, id: number | string): string {
  return entity.detailHref
    ? entity.detailHref.replace("{id}", String(id))
    : `${entity.href}#${entity.key}-${id}`;
}

export const SUBJECTS = [
  "Physics",
  "Chemistry",
  "Mathematics",
  "English",
  "Gujarati",
  "Physical Education",
] as const;

const PRIORITIES = ["High", "Medium", "Low"] as const;
const AREAS = ["Study", "Life", "Project", "Health", "Money"] as const;

const today = "today" as const;

/**
 * The original record types. Their tables are created by migration m001,
 * which is keyed to this list, so later edits here must stay additive: new
 * columns are added through a migration, never by changing an existing one.
 */
export const LEGACY_ENTITIES: readonly Entity[] = [
  {
    key: "chapters",
    singular: "Chapter",
    plural: "Chapters",
    href: "/study",
    orderBy: "klass DESC, subject, id",
    titleField: "name",
    searchable: ["name"],
    fields: [
      { name: "subject", label: "Subject", type: "select", options: SUBJECTS },
      { name: "klass", label: "Class", type: "select", options: ["12", "11"] },
      {
        name: "track",
        label: "Track",
        type: "select",
        options: ["Boards", "JEE", "Both"],
        default: "Both",
      },
      { name: "name", label: "Chapter", type: "text", required: true },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        options: PRIORITIES,
        default: "Medium",
      },
      {
        name: "mastery",
        label: "Mastery %",
        type: "number",
        min: 0,
        max: 100,
        default: 0,
      },
      { name: "done", label: "Covered", type: "boolean" },
      { name: "weight", label: "Exam weight (1-5)", type: "number", min: 1, max: 5, default: 3 },
      { name: "est_minutes", label: "Est. minutes", type: "number", min: 5, max: 600, default: 90 },
      { name: "revision_count", label: "Revisions", type: "number", min: 0, max: 1000, default: 0 },
      { name: "last_revised_at", label: "Last revised", type: "date" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "study_sessions",
    singular: "Study session",
    plural: "Study sessions",
    href: "/study",
    orderBy: "date DESC, id DESC",
    titleField: "notes",
    searchable: ["notes"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "subject", label: "Subject", type: "select", options: SUBJECTS },
      {
        name: "minutes",
        label: "Minutes",
        type: "number",
        required: true,
        min: 1,
        max: 1440,
      },
      {
        name: "questions",
        label: "Questions",
        type: "number",
        min: 0,
        max: 5000,
        default: 0,
      },
      {
        name: "correct",
        label: "Correct",
        type: "number",
        min: 0,
        max: 5000,
        default: 0,
      },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "lectures",
    singular: "Lecture",
    plural: "Lectures",
    href: "/study",
    orderBy: "id DESC",
    titleField: "title",
    searchable: ["title", "course", "notes"],
    fields: [
      { name: "course", label: "Course / batch", type: "text", default: "PW Manzil" },
      { name: "title", label: "Lecture", type: "text", required: true },
      { name: "subject", label: "Subject", type: "select", options: SUBJECTS },
      { name: "planned_date", label: "Planned for", type: "date" },
      { name: "url", label: "URL", type: "url" },
      {
        name: "duration_min",
        label: "Duration (min)",
        type: "number",
        min: 0,
        max: 1000,
      },
      {
        name: "watched_min",
        label: "Watched (min)",
        type: "number",
        min: 0,
        max: 1000,
        default: 0,
      },
      {
        name: "speed",
        label: "Speed",
        type: "number",
        min: 0.5,
        max: 3,
        step: 0.25,
        default: 1,
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "exams",
    singular: "Exam",
    plural: "Exams",
    href: "/study",
    orderBy: "date",
    titleField: "name",
    searchable: ["name", "notes"],
    fields: [
      { name: "name", label: "Exam", type: "text", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      {
        name: "track",
        label: "Track",
        type: "select",
        options: ["Boards", "JEE", "Both"],
        default: "Both",
      },
      {
        name: "target_pct",
        label: "Target %",
        type: "number",
        min: 0,
        max: 100,
      },
      {
        name: "score_pct",
        label: "Score %",
        type: "number",
        min: 0,
        max: 100,
      },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "mistakes",
    singular: "Mistake",
    plural: "Mistakes",
    href: "/study",
    orderBy: "fixed, date DESC, id DESC",
    titleField: "note",
    searchable: ["note", "chapter"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "subject", label: "Subject", type: "select", options: SUBJECTS },
      { name: "chapter", label: "Chapter", type: "text" },
      { name: "note", label: "What went wrong", type: "textarea", required: true },
      { name: "fixed", label: "Fixed", type: "boolean" },
    ],
  },
  {
    key: "focus_sessions",
    singular: "Focus session",
    plural: "Focus sessions",
    href: "/focus",
    orderBy: "date DESC, id DESC",
    titleField: "label",
    searchable: ["label", "notes"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "label", label: "What for", type: "text" },
      {
        name: "minutes",
        label: "Minutes",
        type: "number",
        required: true,
        min: 1,
        max: 1440,
      },
      {
        name: "distractions",
        label: "Distractions",
        type: "number",
        min: 0,
        max: 500,
        default: 0,
      },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "screen_logs",
    singular: "Screen time entry",
    plural: "Screen time",
    href: "/focus",
    orderBy: "date DESC, id DESC",
    titleField: "note",
    searchable: ["note"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: ["Study", "Coding", "Media", "Social", "Games", "Other"],
      },
      {
        name: "minutes",
        label: "Minutes",
        type: "number",
        required: true,
        min: 1,
        max: 1440,
      },
      { name: "note", label: "Note", type: "text" },
    ],
  },
  {
    key: "tasks",
    singular: "Task",
    plural: "Tasks",
    href: "/plans?tab=tasks",
    orderBy:
      "CASE status WHEN 'Doing' THEN 0 WHEN 'To do' THEN 1 ELSE 2 END, due IS NULL, due, id",
    titleField: "title",
    searchable: ["title"],
    fields: [
      { name: "title", label: "Task", type: "text", required: true },
      { name: "due", label: "Due", type: "date" },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        options: PRIORITIES,
        default: "Medium",
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["To do", "Doing", "Done"],
        default: "To do",
      },
      { name: "area", label: "Area", type: "select", options: AREAS },
      {
        name: "recurrence",
        label: "Repeats",
        type: "select",
        options: ["None", "Daily", "Weekly", "Weekdays", "Monthly"],
        default: "None",
      },
      { name: "recurrence_until", label: "Repeat until", type: "date" },
      { name: "routine_id", label: "Routine", type: "number" },
    ],
  },
  {
    key: "habits",
    singular: "Habit",
    plural: "Habits",
    href: "/plans?tab=habits",
    orderBy: "id",
    titleField: "name",
    searchable: ["name"],
    fields: [
      { name: "name", label: "Habit", type: "text", required: true },
      { name: "note", label: "Note", type: "text" },
    ],
  },
  {
    key: "goals",
    singular: "Goal",
    plural: "Goals",
    href: "/plans?tab=goals",
    orderBy: "CASE status WHEN 'Active' THEN 0 WHEN 'Paused' THEN 1 ELSE 2 END, target_date IS NULL, target_date, id",
    titleField: "title",
    searchable: ["title", "notes"],
    fields: [
      { name: "title", label: "Goal", type: "text", required: true },
      { name: "area", label: "Area", type: "select", options: AREAS },
      { name: "target_date", label: "Target date", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["Active", "Paused", "Done", "Dropped"],
        default: "Active",
      },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "parent_id", label: "Parent goal", type: "number", min: 1 },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        options: ["Long-term", "Quarter", "Month", "Week", "Milestone"],
        default: "Long-term",
      },
      { name: "start_date", label: "Start date", type: "date" },
      {
        name: "review_cadence",
        label: "Review",
        type: "select",
        options: ["None", "Weekly", "Monthly"],
        default: "None",
      },
      { name: "last_reviewed_at", label: "Last reviewed", type: "date" },
    ],
  },
  {
    key: "health_logs",
    singular: "Health log",
    plural: "Health logs",
    href: "/health",
    orderBy: "date DESC, id DESC",
    titleField: "workout",
    searchable: ["workout", "meals", "notes"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      {
        name: "sleep_hours",
        label: "Sleep (h)",
        type: "number",
        min: 0,
        max: 24,
        step: 0.25,
      },
      {
        name: "energy",
        label: "Energy (1-5)",
        type: "number",
        min: 1,
        max: 5,
      },
      {
        name: "water_l",
        label: "Water (L)",
        type: "number",
        min: 0,
        max: 20,
        step: 0.25,
      },
      { name: "workout", label: "Workout", type: "text" },
      { name: "meals", label: "Meals", type: "text" },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "media_items",
    singular: "Media item",
    plural: "Media",
    href: "/media",
    orderBy: "CASE status WHEN 'In progress' THEN 0 WHEN 'Planned' THEN 1 WHEN 'Done' THEN 2 ELSE 3 END, id DESC",
    titleField: "title",
    searchable: ["title", "notes"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        options: ["Anime", "Movie", "Series", "Book", "Manga", "Game", "Podcast"],
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["Planned", "In progress", "Done", "Dropped"],
        default: "Planned",
      },
      {
        name: "rating",
        label: "Rating (0-10)",
        type: "number",
        min: 0,
        max: 10,
        step: 0.5,
      },
      {
        name: "progress_current",
        label: "Progress (done)",
        type: "number",
        min: 0,
        max: 100000,
        step: 1,
      },
      {
        name: "progress_total",
        label: "Progress (total)",
        type: "number",
        min: 0,
        max: 100000,
        step: 1,
      },
      { name: "started_on", label: "Started", type: "date" },
      { name: "finished_on", label: "Finished", type: "date" },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "projects",
    singular: "Project",
    plural: "Projects",
    href: "/projects",
    detailHref: "/projects/{id}",
    orderBy: "CASE status WHEN 'Active' THEN 0 WHEN 'Idea' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END, id DESC",
    titleField: "name",
    searchable: ["name", "milestone", "notes", "description", "category", "tags"],
    fields: [
      { name: "name", label: "Project", type: "text", required: true },
      { name: "repo", label: "Repository URL", type: "url" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["Active", "Idea", "Paused", "Shipped"],
        default: "Active",
      },
      { name: "milestone", label: "Next milestone", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Category", type: "text" },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "tech_stack", label: "Tech stack", type: "tags" },
      { name: "local_path", label: "Local path (reference only)", type: "text" },
      { name: "default_branch", label: "Default branch", type: "text" },
      { name: "current_branch", label: "Current branch", type: "text" },
      { name: "milestone_date", label: "Milestone date", type: "date" },
      { name: "last_activity_at", label: "Last activity", type: "text" },
      { name: "last_commit_sha", label: "Last commit", type: "text" },
      { name: "last_commit_message", label: "Last commit message", type: "text" },
      { name: "last_commit_at", label: "Last commit at", type: "text" },
      { name: "external_id", label: "External id", type: "text" },
      {
        name: "source",
        label: "Source",
        type: "select",
        options: ["manual", "import"],
        default: "manual",
      },
      { name: "archived", label: "Archived", type: "boolean" },
      { name: "pinned", label: "Pinned", type: "boolean" },
    ],
  },
  {
    key: "project_items",
    singular: "Backlog item",
    plural: "Backlog",
    href: "/projects",
    orderBy: "CASE status WHEN 'Doing' THEN 0 WHEN 'Backlog' THEN 1 ELSE 2 END, id DESC",
    titleField: "title",
    searchable: ["title", "project", "description"],
    fields: [
      { name: "project", label: "Project", type: "text", required: true },
      { name: "title", label: "Item", type: "text", required: true },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        options: ["Feature", "Bug", "Release", "Chore"],
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["Backlog", "Doing", "Done"],
        default: "Backlog",
      },
      { name: "priority", label: "Priority", type: "select", options: PRIORITIES, default: "Medium" },
      { name: "due_date", label: "Due", type: "date" },
      { name: "description", label: "Details", type: "textarea" },
    ],
  },
  {
    key: "transactions",
    singular: "Transaction",
    plural: "Transactions",
    href: "/money",
    orderBy: "date DESC, id DESC",
    titleField: "note",
    searchable: ["note", "category"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      {
        name: "kind",
        label: "Type",
        type: "select",
        options: ["Expense", "Income"],
      },
      {
        name: "amount",
        label: "Amount (INR)",
        type: "number",
        required: true,
        min: 0,
        max: 100000000,
        step: 0.01,
      },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: [
          "Food",
          "Transport",
          "School",
          "Subscriptions",
          "Games",
          "Allowance",
          "Gift",
          "Other",
        ],
      },
      { name: "note", label: "Note", type: "text" },
      {
        name: "project_id",
        label: "Project (id)",
        type: "number",
        min: 1,
        max: 100000000,
      },
    ],
  },
  {
    key: "savings_goals",
    singular: "Savings goal",
    plural: "Savings goals",
    href: "/money",
    orderBy: "id",
    titleField: "name",
    searchable: ["name"],
    fields: [
      { name: "name", label: "Goal", type: "text", required: true },
      {
        name: "target",
        label: "Target (INR)",
        type: "number",
        required: true,
        min: 1,
        max: 100000000,
      },
      {
        name: "saved",
        label: "Saved (INR)",
        type: "number",
        min: 0,
        max: 100000000,
        default: 0,
      },
      { name: "deadline", label: "Deadline", type: "date" },
    ],
  },
  {
    key: "journal_entries",
    singular: "Journal entry",
    plural: "Journal",
    href: "/journal",
    orderBy: "date DESC, id DESC",
    // Search hits show the title only; the body is searchable but never shown as a hit.
    titleField: "title",
    searchable: ["title", "tags", "win", "setback", "text"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "title", label: "Title", type: "text" },
      { name: "tags", label: "Tags", type: "tags" },
      {
        name: "mood",
        label: "Mood (1-5)",
        type: "number",
        min: 1,
        max: 5,
      },
      {
        name: "energy",
        label: "Energy (1-5)",
        type: "number",
        min: 1,
        max: 5,
      },
      { name: "win", label: "A win", type: "text" },
      { name: "setback", label: "A setback", type: "text" },
      { name: "text", label: "Reflection", type: "textarea" },
    ],
  },
];

/** Every record type: the legacy set plus the feature modules' extensions. */
export const ENTITY_LIST: readonly Entity[] = [
  ...LEGACY_ENTITIES,
  ...EXTENSION_ENTITIES,
];

function indexEntities(list: readonly Entity[]): Record<string, Entity> {
  const index: Record<string, Entity> = {};
  for (const entity of list) {
    if (Object.prototype.hasOwnProperty.call(index, entity.key))
      throw new Error(`Duplicate entity key: ${entity.key}`);
    index[entity.key] = entity;
  }
  return index;
}

export const ENTITIES: Readonly<Record<string, Entity>> =
  indexEntities(ENTITY_LIST);

export function getEntity(key: string): Entity | undefined {
  return Object.prototype.hasOwnProperty.call(ENTITIES, key)
    ? ENTITIES[key]
    : undefined;
}
