import type { Entity } from "../entities";

/** Routine templates. Their items live in routine_items (see the m070 migration). */
export const ROUTINE_ENTITY: Entity = {
  key: "routines",
  singular: "Routine",
  plural: "Routines",
  href: "/plans?tab=routines",
  orderBy: "name COLLATE NOCASE, id",
  titleField: "name",
  searchable: ["name", "description"],
  fields: [
    { name: "name", label: "Routine", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea" },
  ],
};
