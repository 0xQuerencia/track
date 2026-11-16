"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { deleteRow, insertRow, updateField } from "@/lib/crud";
import { getDb } from "@/lib/db";
import { isoDate, todayStr } from "@/lib/dates";
import { getEntity } from "@/lib/entities";
import { coerceValue, parseForm } from "@/lib/form";
import { clientIpFrom, createLimiter } from "@/lib/security/rate-limit";
import { sessionCookieOptions } from "@/lib/security/cookies";
import { verifyOriginHeaders } from "@/lib/security/origin";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  passwordMatches,
  readSessionConfig,
  verifySessionToken,
} from "@/lib/session";

export type ActionState = { ok: boolean; message: string } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");

export async function createRowAction(
  key: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const entity = getEntity(key);
  if (!entity) return { ok: false, message: "Unknown form." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  insertRow(entity.key, parsed.values);
  refresh();
  return { ok: true, message: `${entity.singular} added.` };
}

export async function deleteRowAction(key: string, id: number): Promise<void> {
  await requireSession();
  if (!getEntity(key) || !Number.isInteger(id)) return;
  deleteRow(key, id);
  refresh();
}

/** Saves one inline edit (a status, a mastery %, a checkbox) on an existing row. */
export async function setFieldAction(
  key: string,
  id: number,
  fieldName: string,
  raw: string,
): Promise<ActionState> {
  await requireSession();
  const entity = getEntity(key);
  const field = entity?.fields.find((f) => f.name === fieldName);
  if (!entity || !field || !Number.isInteger(id))
    return { ok: false, message: "Unknown field." };
  const result = coerceValue(field, raw);
  if ("error" in result) return { ok: false, message: result.error };
  updateField(entity.key, id, field.name, result.value);
  refresh();
  return { ok: true, message: "Saved." };
}

export async function toggleHabitAction(
  habitId: number,
  date: string,
): Promise<void> {
  await requireSession();
  if (!Number.isInteger(habitId) || !isoDate(date)) return;
  const db = getDb();
  const exists = db
    .prepare("SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ?")
    .get(habitId, date);
  if (exists)
    db.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?").run(
      habitId,
      date,
    );
  else
    db.prepare("INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)").run(
      habitId,
      date,
    );
  refresh();
}

/** Called when the focus timer stops. Minutes are clamped server-side. */
export async function saveFocusSessionAction(
  minutes: number,
  label: string,
): Promise<ActionState> {
  await requireSession();
  const clamped = Math.min(720, Math.max(1, Math.round(Number(minutes) || 0)));
  insertRow("focus_sessions", {
    date: todayStr(),
    label: label.trim().slice(0, 200) || null,
    minutes: clamped,
    distractions: 0,
    notes: null,
  });
  refresh();
  return { ok: true, message: `Saved ${clamped} min of focus.` };
}

/* ---- sign in / out ---- */

/** Failed passwords per client IP: 5 per 15 minutes, then locked until the window ends. */
const loginByIp = createLimiter({ max: 5, windowMs: 15 * 60_000 });
/** Failures across every client. Stops a flood of spoofed IPs from evading the per-IP limit. */
const loginAll = createLimiter({ max: 30, windowMs: 15 * 60_000, maxKeys: 1 });
const ALL_CLIENTS = "all";
/** Every failed or locked attempt waits this long, so guessing is slow even before a lock. */
const FAILURE_DELAY_MS = 600;
const MAX_PASSWORD_LENGTH = 200;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function lockedMessage(retryAfterMs: number): ActionState {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return {
    ok: false,
    message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  };
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requestHeaders = await headers();
  if (!verifyOriginHeaders(requestHeaders).ok)
    return { ok: false, message: "Sign-in request was rejected." };

  const session = readSessionConfig(process.env);
  if (!session.ok) {
    // Logged server-side only; the problem text names env vars, never values.
    console.error(`[auth] sign-in disabled: ${session.problem}`);
    return { ok: false, message: "Sign-in is not configured on this server." };
  }

  const ip = clientIpFrom(requestHeaders);
  const waits = [loginByIp.status(ip), loginAll.status(ALL_CLIENTS)].flatMap(
    (status) => (status.locked ? [status.retryAfterMs] : []),
  );
  if (waits.length > 0) {
    await wait(FAILURE_DELAY_MS);
    return lockedMessage(Math.max(...waits));
  }

  const password = String(formData.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH);
  if (!(await passwordMatches(password))) {
    loginByIp.recordFailure(ip);
    loginAll.recordFailure(ALL_CLIENTS);
    await wait(FAILURE_DELAY_MS);
    return { ok: false, message: "Wrong password." };
  }

  loginByIp.reset(ip);
  const token = await createSessionToken(process.env);
  if (!token) return { ok: false, message: "Could not start a session." };
  (await cookies()).set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(requestHeaders, SESSION_DAYS * 86_400),
  );
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const requestHeaders = await headers();
  // A cross-site form cannot sign the user out. Its request is simply ignored.
  if (!verifyOriginHeaders(requestHeaders).ok) return;
  // Same attributes as the set, so the browser replaces the exact cookie.
  (await cookies()).set(
    SESSION_COOKIE,
    "",
    sessionCookieOptions(requestHeaders, 0),
  );
  redirect("/login");
}
