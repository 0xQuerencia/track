import { deleteRow } from "../crud";
import { getDb } from "../db";
import { getEntity } from "../entities";
import { parseForm, type Value } from "../form";
import { parseBirthday } from "./birthday";

/*
 * Writes for people and important dates. Validation that the generic form
 * cannot express (birthday, person reference, reminder range) happens here.
 */

export type RecordValues = Record<string, Value>;
export type ParsedRecord = { values: RecordValues } | { error: string };

export function parsePersonForm(formData: FormData): ParsedRecord {
  const entity = getEntity("people");
  if (!entity) return { error: "People are not available." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { error: parsed.error };
  const birthday = parseBirthday(String(parsed.values.birthday ?? ""));
  if (!birthday.ok) return { error: birthday.error };
  return { values: { ...parsed.values, birthday: birthday.value } };
}

export function createPerson(values: RecordValues): number {
  const result = getDb()
    .prepare(
      `INSERT INTO people (name, relationship, phone, notes, tags, birthday, last_contacted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.name ?? null,
      values.relationship ?? null,
      values.phone ?? null,
      values.notes ?? null,
      values.tags ?? null,
      values.birthday ?? null,
      values.last_contacted ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function updatePerson(id: number, values: RecordValues): boolean {
  const result = getDb()
    .prepare(
      `UPDATE people
         SET name = ?, relationship = ?, phone = ?, notes = ?, tags = ?,
             birthday = ?, last_contacted = ?
       WHERE id = ?`,
    )
    .run(
      values.name ?? null,
      values.relationship ?? null,
      values.phone ?? null,
      values.notes ?? null,
      values.tags ?? null,
      values.birthday ?? null,
      values.last_contacted ?? null,
      id,
    );
  return Number(result.changes) > 0;
}

/**
 * Deletes a person. Their important dates are kept, with the person cleared,
 * so no date points at a missing record even when foreign keys are off.
 */
export function deletePerson(id: number): void {
  getDb().prepare("UPDATE important_dates SET person_id = NULL WHERE person_id = ?").run(id);
  deleteRow("people", id);
}

export function parseImportantDateForm(formData: FormData): ParsedRecord {
  const entity = getEntity("important_dates");
  if (!entity) return { error: "Important dates are not available." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { error: parsed.error };
  const values = parsed.values;
  const personId = values.person_id;
  if (personId !== null && personId !== undefined) {
    if (!Number.isInteger(personId) || !personExists(Number(personId)))
      return { error: "Choose a person from the list, or none." };
  }
  const remind = values.remind_days_before;
  if (remind !== null && remind !== undefined && !Number.isInteger(remind))
    return { error: "Remind days must be a whole number." };
  return { values };
}

function personExists(id: number): boolean {
  return getDb().prepare("SELECT 1 FROM people WHERE id = ?").get(id) !== undefined;
}

export function createImportantDate(values: RecordValues): number {
  const result = getDb()
    .prepare(
      `INSERT INTO important_dates
         (title, date, person_id, kind, repeat_yearly, remind_days_before)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.title ?? null,
      values.date ?? null,
      values.person_id ?? null,
      values.kind ?? "Other",
      values.repeat_yearly ? 1 : 0,
      values.remind_days_before ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function updateImportantDate(id: number, values: RecordValues): boolean {
  const result = getDb()
    .prepare(
      `UPDATE important_dates
         SET title = ?, date = ?, person_id = ?, kind = ?, repeat_yearly = ?,
             remind_days_before = ?
       WHERE id = ?`,
    )
    .run(
      values.title ?? null,
      values.date ?? null,
      values.person_id ?? null,
      values.kind ?? "Other",
      values.repeat_yearly ? 1 : 0,
      values.remind_days_before ?? null,
      id,
    );
  return Number(result.changes) > 0;
}

export function deleteImportantDate(id: number): void {
  deleteRow("important_dates", id);
}
