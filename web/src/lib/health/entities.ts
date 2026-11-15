import type { Entity } from "../entities";
import { FITNESS_METRICS, MEALS, WORKOUT_KINDS } from "./constants";

const today = "today" as const;

/*
 * Health record types added by the health upgrade. health_logs (sleep, energy,
 * water, meals text) is unchanged and lives in entities.ts.
 */
export const HEALTH_ENTITIES: readonly Entity[] = [
  {
    key: "workouts",
    singular: "Workout",
    plural: "Workouts",
    href: "/health?tab=exercise",
    orderBy: "date DESC, id DESC",
    titleField: "name",
    searchable: ["name", "notes"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "kind", label: "Kind", type: "select", options: WORKOUT_KINDS },
      { name: "name", label: "Session", type: "text" },
      { name: "minutes", label: "Minutes", type: "number", required: true, min: 1, max: 1440 },
      { name: "intensity", label: "Intensity (1-5)", type: "number", min: 1, max: 5 },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "workout_routines",
    singular: "Workout routine",
    plural: "Workout routines",
    href: "/health?tab=exercise",
    orderBy: "name COLLATE NOCASE, id",
    titleField: "name",
    searchable: ["name", "exercises"],
    fields: [
      { name: "name", label: "Routine", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "exercises", label: "Exercises", type: "textarea" },
    ],
  },
  {
    key: "hydration_logs",
    singular: "Hydration log",
    plural: "Hydration logs",
    href: "/health?tab=hydration",
    orderBy: "date DESC, id DESC",
    titleField: "date",
    searchable: [],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "ml", label: "Water (ml)", type: "number", required: true, min: 1, max: 10000 },
    ],
  },
  {
    key: "nutrition_notes",
    singular: "Nutrition note",
    plural: "Nutrition notes",
    href: "/health?tab=nutrition",
    orderBy: "date DESC, id DESC",
    titleField: "notes",
    searchable: ["notes"],
    fields: [
      { name: "date", label: "Date", type: "date", default: today },
      { name: "meal", label: "Meal", type: "select", options: MEALS },
      { name: "notes", label: "Notes", type: "textarea", required: true },
    ],
  },
  {
    key: "fitness_goals",
    singular: "Fitness goal",
    plural: "Fitness goals",
    href: "/health?tab=goals",
    orderBy: "active DESC, id",
    titleField: "title",
    searchable: ["title"],
    fields: [
      { name: "title", label: "Goal", type: "text", required: true },
      { name: "metric", label: "Metric", type: "select", options: FITNESS_METRICS, required: true },
      { name: "target", label: "Target", type: "number", required: true, min: 0, max: 100000 },
      { name: "unit", label: "Unit", type: "text" },
      { name: "active", label: "Active", type: "boolean" },
    ],
  },
];
