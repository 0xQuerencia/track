"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { insertRow } from "@/lib/crud";
import { getDb } from "@/lib/db";
import { parseForm } from "@/lib/form";
import { getEntity } from "@/lib/entities";
import { checkServiceUrl } from "@/lib/devices/check";
import { getDevice, getService, recordServiceCheck, setDeviceConnectivity, setServiceStatusManual } from "@/lib/devices/queries";
import { createLimiter } from "@/lib/security/rate-limit";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type DeviceActionState = { ok: boolean; message: string } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");

/**
 * Health checks are user-clicked and each one makes an outbound request, so
 * they are rate-limited: 20 per 10 minutes. Every check counts, not only failures.
 */
const checkLimiter = createLimiter({ max: 20, windowMs: 10 * 60_000, maxKeys: 1 });
const CHECK_KEY = "service-checks";

/** Sets a device's connectivity by hand. Stamped "manual", never presented as a measurement. */
export async function setDeviceConnectivityAction(deviceId: number, state: string): Promise<DeviceActionState> {
  await requireSession();
  if (!Number.isInteger(deviceId) || !getDevice(deviceId)) return { ok: false, message: "Device not found." };
  if (!setDeviceConnectivity(deviceId, state, new Date())) return { ok: false, message: "Choose Online, Offline or Unknown." };
  refresh();
  return { ok: true, message: state === "Unknown" ? "Set to unknown." : `Set to ${state} (manual).` };
}

/** Creates a service, with its device and project checked to exist. */
export async function addServiceAction(_previous: DeviceActionState, formData: FormData): Promise<DeviceActionState> {
  await requireSession();
  const entity = getEntity("services");
  if (!entity) return { ok: false, message: "Services are not available." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const { device_id: deviceId, project_id: projectId } = parsed.values;
  if (deviceId !== null && !getDevice(Number(deviceId))) return { ok: false, message: "Choose an existing device." };
  if (projectId !== null && !getDb().prepare("SELECT 1 FROM projects WHERE id = ?").get(Number(projectId)))
    return { ok: false, message: "Choose an existing project." };
  insertRow("services", parsed.values);
  refresh();
  return { ok: true, message: "Service added. Its status stays Unknown until it is checked or set by hand." };
}

/** Adds a maintenance log entry to a device. */
export async function addMaintenanceAction(_previous: DeviceActionState, formData: FormData): Promise<DeviceActionState> {
  await requireSession();
  const entity = getEntity("maintenance_logs");
  if (!entity) return { ok: false, message: "The maintenance log is not available." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const deviceId = Number(parsed.values.device_id);
  if (!getDevice(deviceId)) return { ok: false, message: "Device not found." };
  insertRow("maintenance_logs", parsed.values);
  refresh();
  return { ok: true, message: "Maintenance entry added." };
}

/**
 * Runs one health check on a service's stored URL. Only the outcome (Up or
 * Down) and its time are stored. A blocked address is reported and not stored.
 */
export async function checkServiceAction(serviceId: number): Promise<DeviceActionState> {
  await requireSession();
  if (!Number.isInteger(serviceId)) return { ok: false, message: "Service not found." };
  const service = getService(serviceId);
  if (!service) return { ok: false, message: "Service not found." };
  if (checkLimiter.status(CHECK_KEY).locked) return { ok: false, message: "Too many checks. Wait a few minutes and try again." };
  checkLimiter.recordFailure(CHECK_KEY);

  const outcome = await checkServiceUrl(service.url);
  if (outcome.kind === "blocked") return { ok: false, message: `Not checked: ${outcome.reason}` };
  recordServiceCheck(serviceId, outcome.status, new Date());
  refresh();
  const code = outcome.httpStatus === null ? "" : ` (HTTP ${outcome.httpStatus})`;
  return { ok: outcome.status === "Up", message: `${outcome.status}${code}: ${outcome.reason}.` };
}

/** Records a manual Up or Down for a service, labelled "manual". */
export async function setServiceStatusAction(serviceId: number, state: string): Promise<DeviceActionState> {
  await requireSession();
  if (!Number.isInteger(serviceId) || !getService(serviceId)) return { ok: false, message: "Service not found." };
  if (!setServiceStatusManual(serviceId, state, new Date())) return { ok: false, message: "Choose Up or Down." };
  refresh();
  return { ok: true, message: `Set to ${state} (manual).` };
}
