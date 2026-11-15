/*
 * Honest status. A device or service is shown as Online/Up only when there is
 * evidence for it: either the user set it by hand (labelled "manual"), or an
 * automatic check recorded it within the last 24 hours. Everything else is
 * shown as Unknown, so the UI never claims a state it has not verified.
 */

export const VERIFIED_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Timestamps this far in the future are treated as clock errors, not evidence. */
const CLOCK_SKEW_MS = 60 * 1000;

export type StatusSource = "manual" | "check";

export type DeviceConnectivity = {
  state: "Online" | "Offline" | "Unknown";
  source: StatusSource | null;
  label: string;
  detail: string;
};

export type ServiceState = {
  state: "Up" | "Down" | "Unknown";
  source: StatusSource | null;
  checkedAt: string | null;
  label: string;
  detail: string;
};

/** Parses a stored ISO timestamp. Returns null for anything that is not a valid, non-future time. */
export function parseStamp(value: unknown, now: Date): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  if (parsed - now.getTime() > CLOCK_SKEW_MS) return null;
  return new Date(parsed);
}

/** True when a check recorded at `at` is still inside the 24-hour window. */
export function isFresh(at: Date, now: Date): boolean {
  return now.getTime() - at.getTime() <= VERIFIED_WINDOW_MS;
}

const UNKNOWN_DEVICE: DeviceConnectivity = {
  state: "Unknown",
  source: null,
  label: "Unknown",
  detail: "Not connected",
};

export function deviceConnectivity(
  input: { connectivity: unknown; verified_at: unknown; verified_by: unknown },
  now: Date,
): DeviceConnectivity {
  const claim = input.connectivity;
  if (claim !== "Online" && claim !== "Offline") return UNKNOWN_DEVICE;
  const at = parseStamp(input.verified_at, now);
  if (!at) return UNKNOWN_DEVICE;
  if (input.verified_by === "manual")
    return { state: claim, source: "manual", label: `${claim} (manual)`, detail: "Set by you" };
  if (input.verified_by === "check" && isFresh(at, now))
    return { state: claim, source: "check", label: claim, detail: "Verified in the last 24 hours" };
  return UNKNOWN_DEVICE;
}

export function serviceState(
  input: { status: unknown; status_source: unknown; last_checked_at: unknown },
  now: Date,
): ServiceState {
  const claim = input.status;
  const unknown = (detail: string): ServiceState => ({
    state: "Unknown",
    source: null,
    checkedAt: null,
    label: "Unknown",
    detail,
  });
  if (claim !== "Up" && claim !== "Down") return unknown("Not checked");
  const at = parseStamp(input.last_checked_at, now);
  if (!at) return unknown("Not checked");
  const checkedAt = at.toISOString();
  if (input.status_source === "manual")
    return { state: claim, source: "manual", checkedAt, label: `${claim} (manual)`, detail: "Set by you" };
  if (input.status_source === "check" && isFresh(at, now))
    return { state: claim, source: "check", checkedAt, label: claim, detail: "Checked in the last 24 hours" };
  return unknown("Last check is more than 24 hours old");
}
