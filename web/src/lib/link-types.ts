import { ENTITY_LIST } from "./entities";

/*
 * Client-safe: no database imports here, so components can use these values
 * and types directly.
 */

export type LinkTypeDef = { key: string; label: string };

/**
 * Every kind of record that can be linked. The record types from entities.ts
 * are included automatically. To add a kind that has no table of its own
 * (an AI session, a repo, an event), add one line to the array below.
 */
export const LINK_TYPES: readonly LinkTypeDef[] = [
  ...ENTITY_LIST.map((entity) => ({ key: entity.key, label: entity.plural })),
  { key: "ai_session", label: "AI session" },
  { key: "repo", label: "Repository" },
  { key: "event", label: "Event" },
  { key: "milestone", label: "Milestone" },
  { key: "document", label: "Document" },
];

export const LINK_RELATIONS = [
  "related",
  "part_of",
  "blocks",
  "supports",
  "source",
] as const;

export type LinkRelation = (typeof LINK_RELATIONS)[number];

export const LINK_RELATION_LABELS: Record<LinkRelation, string> = {
  related: "Related to",
  part_of: "Part of",
  blocks: "Blocks",
  supports: "Supports",
  source: "Source for",
};

/** One link as shown from one of its two ends. */
export type LinkView = {
  id: number;
  /** "out": this record links to `other`. "in": `other` links to this record. */
  direction: "out" | "in";
  relation: LinkRelation;
  note: string | null;
  type: string;
  typeLabel: string;
  recordId: string;
  /** Resolved record title, or the raw id for kinds with no table. */
  title: string;
  /** Page the record lives on, when it is an entity. */
  href: string | null;
  createdAt: string;
};

export function isLinkType(key: string): boolean {
  return LINK_TYPES.some((type) => type.key === key);
}

export function linkTypeLabel(key: string): string {
  return LINK_TYPES.find((type) => type.key === key)?.label ?? key;
}

export function isLinkRelation(value: string): value is LinkRelation {
  return (LINK_RELATIONS as readonly string[]).includes(value);
}
