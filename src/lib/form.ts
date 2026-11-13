import { isoDate, todayStr } from "./dates";
import type { Entity, Field } from "./entities";

export type Value = string | number | null;
export type Coerced = { value: Value } | { error: string };

const MAX_TEXT = 2000;

/** Validates one raw input against its field definition. */
export function coerceValue(
  field: Field,
  raw: FormDataEntryValue | null | undefined,
): Coerced {
  const text = typeof raw === "string" ? raw.trim() : "";
  const required = (): Coerced => ({ error: `${field.label} is required.` });

  switch (field.type) {
    case "text":
    case "textarea": {
      if (!text) return field.required ? required() : { value: null };
      return { value: text.slice(0, MAX_TEXT) };
    }
    case "url": {
      if (!text) return field.required ? required() : { value: null };
      if (!/^https?:\/\/\S+$/i.test(text) || text.length > MAX_TEXT)
        return { error: `${field.label} must be a full http(s) link.` };
      return { value: text };
    }
    case "number": {
      if (!text) {
        if (field.default !== undefined) return { value: Number(field.default) };
        return field.required ? required() : { value: null };
      }
      const n = Number(text);
      if (!Number.isFinite(n))
        return { error: `${field.label} must be a number.` };
      if (field.min !== undefined && n < field.min)
        return { error: `${field.label} must be at least ${field.min}.` };
      if (field.max !== undefined && n > field.max)
        return { error: `${field.label} must be at most ${field.max}.` };
      return { value: n };
    }
    case "date": {
      if (!text) {
        if (field.default === "today") return { value: todayStr() };
        return field.required ? required() : { value: null };
      }
      if (!isoDate(text)) return { error: `${field.label} is not a valid date.` };
      return { value: text };
    }
    case "select": {
      const options = field.options ?? [];
      if (options.includes(text)) return { value: text };
      if (text) return { error: `${field.label} has an unknown option.` };
      const fallback =
        typeof field.default === "string" ? field.default : options[0];
      return { value: fallback ?? null };
    }
    case "boolean":
      return { value: raw === "on" || raw === "1" || raw === "true" ? 1 : 0 };
  }
}

export function parseForm(
  entity: Entity,
  data: FormData,
): { values: Record<string, Value> } | { error: string } {
  const values: Record<string, Value> = {};
  for (const field of entity.fields) {
    const result = coerceValue(field, data.get(field.name));
    if ("error" in result) return { error: result.error };
    values[field.name] = result.value;
  }
  return { values };
}
