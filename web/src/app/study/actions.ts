"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/actions";
import { insertRow } from "@/lib/crud";
import { todayStr, isoDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getEntity } from "@/lib/entities";
import { parseForm, type Value } from "@/lib/form";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import {
  addPrereq,
  deleteRevision,
  logRevision,
  removeOverride,
  removePrereq,
  setOverride,
  type WriteResult,
} from "@/lib/study/mutations";

/*
 * Server actions for Study HQ. Each one re-checks the session, validates its
 * inputs, and only then writes. Entity keys are whitelisted: this module
 * cannot be used to insert into arbitrary tables.
 */

const RECORD_KEYS: readonly string[] = ["mock_tests", "question_stats", "assignments", "study_resources"];
const MAX_NOTE = 500;

async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");

const text = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/** A whole number in range, or null. */
function wholeInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** An optional number in range: "" gives null, bad input gives undefined. */
function optionalInRange(raw: string, min: number, max: number): number | null | undefined {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function result(outcome: WriteResult, success: string): ActionState {
  return outcome.ok ? { ok: true, message: success } : { ok: false, message: outcome.error };
}

function chapterExists(id: number): boolean {
  return getDb().prepare("SELECT 1 FROM chapters WHERE id = ?").get(id) !== undefined;
}

/** Cross-field checks that the generic entity validation cannot express. */
function recordProblem(key: string, values: Record<string, Value>): string | null {
  if (key === "mock_tests" && Number(values.scored) > Number(values.total_marks))
    return "Scored cannot be more than total marks.";
  if (key === "question_stats" && Number(values.correct) > Number(values.attempted))
    return "Correct cannot be more than attempted.";
  const chapter = values.chapter_id;
  if (chapter !== null && chapter !== undefined && !chapterExists(Number(chapter)))
    return "Chapter not found.";
  return null;
}

/** Adds a row to one of the study record tables (mocks, question log, assignments, resources). */
export async function createStudyRecordAction(
  key: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const entity = getEntity(key);
  if (!entity || !RECORD_KEYS.includes(key)) return { ok: false, message: "Unknown form." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const problem = recordProblem(key, parsed.values);
  if (problem) return { ok: false, message: problem };
  insertRow(key, parsed.values);
  refresh();
  return { ok: true, message: `${entity.singular} added.` };
}

/** Deletes a study record row (same whitelist as above). */
export async function deleteStudyRecordAction(key: string, id: number): Promise<ActionState> {
  await requireSession();
  if (!RECORD_KEYS.includes(key) || !Number.isInteger(id)) return { ok: false, message: "Unknown record." };
  getDb().prepare(`DELETE FROM "${key}" WHERE id = ?`).run(id);
  refresh();
  return { ok: true, message: "Removed." };
}

/** Logs one revision for a chapter, with optional minutes, confidence and mastery after. */
export async function logRevisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const chapterId = wholeInRange(text(formData, "chapter_id"), 1, Number.MAX_SAFE_INTEGER);
  if (chapterId === null) return { ok: false, message: "Choose a chapter." };
  const date = text(formData, "date");
  if (!isoDate(date)) return { ok: false, message: "Enter a valid date." };
  if (date > todayStr()) return { ok: false, message: "A revision cannot be dated in the future." };
  const minutes = optionalInRange(text(formData, "minutes"), 0, 1440);
  const confidence = optionalInRange(text(formData, "confidence"), 1, 5);
  const masteryAfter = optionalInRange(text(formData, "mastery_after"), 0, 100);
  if (minutes === undefined) return { ok: false, message: "Minutes must be between 0 and 1440." };
  if (confidence === undefined) return { ok: false, message: "Confidence must be from 1 to 5." };
  if (masteryAfter === undefined) return { ok: false, message: "Mastery must be between 0 and 100." };
  const notes = text(formData, "notes").slice(0, MAX_NOTE) || null;
  const outcome = logRevision({ chapterId, date, minutes, confidence, notes, masteryAfter });
  refresh();
  return result(outcome, "Revision logged.");
}

export async function deleteRevisionAction(id: number): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(id)) return { ok: false, message: "Revision not found." };
  const outcome = deleteRevision(id);
  refresh();
  return result(outcome, "Revision removed.");
}

export async function addPrereqAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const chapterId = wholeInRange(text(formData, "chapter_id"), 1, Number.MAX_SAFE_INTEGER);
  const prereqId = wholeInRange(text(formData, "prereq_id"), 1, Number.MAX_SAFE_INTEGER);
  if (chapterId === null || prereqId === null) return { ok: false, message: "Choose a prerequisite." };
  const outcome = addPrereq(chapterId, prereqId);
  refresh();
  return result(outcome, "Prerequisite added.");
}

export async function removePrereqAction(id: number): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(id)) return { ok: false, message: "Prerequisite not found." };
  const outcome = removePrereq(id);
  refresh();
  return result(outcome, "Prerequisite removed.");
}

/** Pin, snooze or skip a chapter in the revision plan. */
export async function setOverrideAction(chapterId: number, action: string): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(chapterId) || chapterId < 1) return { ok: false, message: "Chapter not found." };
  const outcome = setOverride(chapterId, action, todayStr());
  refresh();
  return result(outcome, "Plan updated.");
}

export async function removeOverrideAction(id: number): Promise<ActionState> {
  await requireSession();
  if (!Number.isInteger(id)) return { ok: false, message: "Override not found." };
  const outcome = removeOverride(id);
  refresh();
  return result(outcome, "Override removed.");
}
