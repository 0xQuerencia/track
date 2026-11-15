import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";
import { listRows, type Row } from "../crud";
import { CONNECTIVITY_STATES, SERVICE_STATES } from "../entities-ext/devices-money-media";

/*
 * Reads and writes for devices, services and maintenance logs. Every SQL
 * string is fixed here; request values are only ever bound as parameters.
 */

export type ServiceRow = Row & {
  device_name: string | null;
  project_name: string | null;
};

const all = <T>(sql: string, ...params: SQLInputValue[]): T[] =>
  getDb().prepare(sql).all(...params) as T[];
const one = <T>(sql: string, ...params: SQLInputValue[]): T | undefined =>
  getDb().prepare(sql).get(...params) as T | undefined;

export const nowIso = (now: Date = new Date()): string => now.toISOString();

export function listDevices(): Row[] {
  return listRows("devices");
}

export function getDevice(id: number): Row | undefined {
  return one<Row>(`SELECT * FROM devices WHERE id = ?`, id);
}

/** Services, optionally only those on one device, with the device and project names joined in. */
export function listServices(deviceId?: number): ServiceRow[] {
  if (deviceId === undefined)
    return all<ServiceRow>(
      `SELECT s.*, d.name AS device_name, p.name AS project_name
       FROM services s
       LEFT JOIN devices d ON d.id = s.device_id
       LEFT JOIN projects p ON p.id = s.project_id
       ORDER BY s.name, s.id`,
    );
  return all<ServiceRow>(
    `SELECT s.*, d.name AS device_name, p.name AS project_name
     FROM services s
     LEFT JOIN devices d ON d.id = s.device_id
     LEFT JOIN projects p ON p.id = s.project_id
     WHERE s.device_id = ?
     ORDER BY s.name, s.id`,
    deviceId,
  );
}

export function getService(id: number): Row | undefined {
  return one<Row>(`SELECT * FROM services WHERE id = ?`, id);
}

export function listMaintenance(deviceId: number): Row[] {
  return all<Row>(
    `SELECT * FROM maintenance_logs WHERE device_id = ? ORDER BY date DESC, id DESC LIMIT 200`,
    deviceId,
  );
}

/** Projects for pickers: id and name only. */
export function projectOptions(): { id: number; name: string }[] {
  return all<{ id: number; name: string }>(
    `SELECT id, name FROM projects ORDER BY name COLLATE NOCASE, id LIMIT 500`,
  );
}

export function deviceOptions(): { id: number; name: string }[] {
  return all<{ id: number; name: string }>(
    `SELECT id, name FROM devices ORDER BY name COLLATE NOCASE, id LIMIT 500`,
  );
}

/** Sets connectivity. Only a set state is stamped as verified "manual"; Unknown clears the stamp. */
export function setDeviceConnectivity(id: number, state: string, now: Date): boolean {
  if (!(CONNECTIVITY_STATES as readonly string[]).includes(state)) return false;
  const stamp = nowIso(now);
  if (state === "Unknown") {
    const result = getDb()
      .prepare(
        `UPDATE devices SET connectivity = 'Unknown', verified_at = NULL, verified_by = NULL WHERE id = ?`,
      )
      .run(id);
    return Number(result.changes) > 0;
  }
  const result = getDb()
    .prepare(
      `UPDATE devices
       SET connectivity = ?, verified_at = ?, verified_by = 'manual',
           last_seen_at = CASE WHEN ? = 'Online' THEN ? ELSE last_seen_at END
       WHERE id = ?`,
    )
    .run(state, stamp, state, stamp, id);
  return Number(result.changes) > 0;
}

/** Records a manual Up/Down for a service, labelled "manual". */
export function setServiceStatusManual(id: number, state: string, now: Date): boolean {
  if (!(SERVICE_STATES as readonly string[]).includes(state) || state === "Unknown") return false;
  const result = getDb()
    .prepare(
      `UPDATE services SET status = ?, status_source = 'manual', last_checked_at = ? WHERE id = ?`,
    )
    .run(state, nowIso(now), id);
  return Number(result.changes) > 0;
}

/** Stores only the outcome of an automatic check: Up or Down, and when. */
export function recordServiceCheck(id: number, state: "Up" | "Down", now: Date): void {
  getDb()
    .prepare(
      `UPDATE services SET status = ?, status_source = 'check', last_checked_at = ? WHERE id = ?`,
    )
    .run(state, nowIso(now), id);
}
