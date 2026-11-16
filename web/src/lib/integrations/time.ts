/** Current time as UTC ISO text. Kept in one place so tests can reason about it. */
export function nowIso(): string {
  return new Date().toISOString();
}
