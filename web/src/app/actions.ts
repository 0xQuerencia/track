"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { deleteRow, insertRow, updateField } from "@/lib/crud";
import { getDb } from "@/lib/db";
import { isoDate, todayStr } from "@/lib/dates";
import { getEntity } from "@/lib/entities";
import { coerceValue, parseForm } from "@/lib/form";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  passwordMatches,
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

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!process.env.TRACK_PASSWORD)
    return { ok: false, message: "Sign-in is not configured on this server." };

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS)
    return { ok: false, message: "Too many attempts. Try again in a few minutes." };

  const password = String(formData.get("password") ?? "");
  if (!(await passwordMatches(password))) {
    attempts.set(ip, {
      count: entry && entry.resetAt > now ? entry.count + 1 : 1,
      resetAt: entry && entry.resetAt > now ? entry.resetAt : now + WINDOW_MS,
    });
    return { ok: false, message: "Wrong password." };
  }

  attempts.delete(ip);
  const token = await createSessionToken();
  if (!token) return { ok: false, message: "Could not start a session." };
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.TRACK_COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
