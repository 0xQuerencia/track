import type { Entity } from "../entities";
import { ENTITIES as CALENDAR } from "./calendar";
import { ENTITIES as CAREER_PEOPLE_DOCS } from "./career-people-docs";
import { ENTITIES as DEVICES_MONEY_MEDIA } from "./devices-money-media";
import { ENTITIES as IDEAS_KNOWLEDGE } from "./ideas-knowledge";
import { ENTITIES as PLANS } from "./plans";
import { ENTITIES as PROJECTS } from "./projects";
import { ENTITIES as SESSIONS } from "./sessions";
import { ENTITIES as STUDY } from "./study";

/**
 * Record types added by feature modules. Each module edits only its own file
 * here; its table is created by the matching migration in src/lib/migrations.
 * Keep this file free of runtime imports so entities.ts stays cycle-free.
 */
export const EXTENSION_ENTITIES: readonly Entity[] = [
  ...IDEAS_KNOWLEDGE,
  ...CALENDAR,
  ...PROJECTS,
  ...SESSIONS,
  ...STUDY,
  ...PLANS,
  ...CAREER_PEOPLE_DOCS,
  ...DEVICES_MONEY_MEDIA,
];
