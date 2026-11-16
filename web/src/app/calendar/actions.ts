"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createEvent, deleteEvent, updateEvent } from "@/lib/calendar/events";
import { parseEventInput } from "@/lib/calendar/events-schema";
import {
  EVENT_CATEGORIES,
  RECURRENCES,
  type EventCategory,
  type EventFormValues,
  type Recurrence,
} from "@/lib/calendar/model";
import { returnHref } from "@/lib/calendar/url";
import { calendarTimeZone, todayIn } from "@/lib/calendar/time";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Result of a save. A failed save echoes the typed values back, with a nonce
 * so the form remounts with them instead of losing the user's input.
 */
export type EventActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; values?: EventFormValues; nonce?: number }
  | null;

/** Server actions are public endpoints, so each one re-checks the session and origin. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

async function requireSameOrigin(): Promise<boolean> {
  return verifyOriginHeaders(await headers()).ok;
}

function parseId(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || !/^\d{1,12}$/.test(raw) || Number(raw) <= 0) return null;
  return Number(raw);
}

function echoValues(formData: FormData): EventFormValues {
  const text = (key: string): string => String(formData.get(key) ?? "");
  const category = text("category");
  const recurrence = text("recurrence");
  return {
    title: text("title"),
    date: text("date"),
    end_date: text("end_date"),
    all_day: formData.get("all_day") === "on",
    start_time: text("start_time"),
    end_time: text("end_time"),
    category: (EVENT_CATEGORIES as readonly string[]).includes(category) ? (category as EventCategory) : "Other",
    location: text("location"),
    notes: text("notes"),
    recurrence: (RECURRENCES as readonly string[]).includes(recurrence) ? (recurrence as Recurrence) : "None",
    recurrence_until: text("recurrence_until"),
    reminder_minutes: text("reminder_minutes"),
  };
}

/** Every field the editor sends, as the raw strings the parser expects. */
function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = Object.fromEntries(formData.entries());
  values.all_day = formData.get("all_day") === "on";
  return values;
}

/** Creates an event, or updates one when the form carries its id. */
export async function saveEventAction(
  _previous: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireSession();
  if (!(await requireSameOrigin())) return { ok: false, message: "This request was rejected." };

  const parsed = parseEventInput(formValues(formData));
  if (!parsed.ok) return { ok: false, message: parsed.error, values: echoValues(formData), nonce: Date.now() };

  const id = parseId(formData.get("id"));
  if (id === null) {
    createEvent(parsed.value);
  } else if (!updateEvent(id, parsed.value)) {
    return { ok: false, message: "That event no longer exists." };
  }

  revalidatePath("/calendar");
  revalidatePath("/", "layout");
  const today = todayIn(calendarTimeZone());
  redirect(returnHref(formData.get("returnTo")?.toString(), today, parsed.value.date));
}

/** Deletes an event. Returns to the list the user came from. */
export async function deleteEventAction(formData: FormData): Promise<void> {
  await requireSession();
  if (!(await requireSameOrigin())) return;
  const id = parseId(formData.get("id"));
  if (id !== null) deleteEvent(id);
  revalidatePath("/calendar");
  revalidatePath("/", "layout");
  redirect(returnHref(formData.get("returnTo")?.toString(), todayIn(calendarTimeZone())));
}
