import type { Entity } from "../entities";
import { HEALTH_ENTITIES } from "../health/entities";
import { ROUTINE_ENTITY } from "../plans/entities";

/**
 * Record types for the plans and health modules. Health's record types are
 * defined beside its code in src/lib/health and re-exported here, so this
 * module owns every entity the migration m070 creates.
 */
export const ENTITIES: readonly Entity[] = [ROUTINE_ENTITY, ...HEALTH_ENTITIES];
