import { daysUntil } from "../dates";
import { EXPIRY_ATTENTION_DAYS } from "./constants";

/*
 * Expiry badge for a document. Pure, so the thresholds are tested directly.
 */

export type ExpiryBadge = {
  tone: "expired" | "soon" | "ok";
  label: string;
  daysLeft: number;
};

export function expiryBadge(expiresOn: string | null, today: string): ExpiryBadge | null {
  if (!expiresOn) return null;
  const daysLeft = daysUntil(expiresOn, today);
  if (daysLeft < 0) {
    const late = -daysLeft;
    return { tone: "expired", daysLeft, label: `Expired ${late} ${late === 1 ? "day" : "days"} ago` };
  }
  if (daysLeft <= EXPIRY_ATTENTION_DAYS)
    return {
      tone: "soon",
      daysLeft,
      label: daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
    };
  return { tone: "ok", daysLeft, label: `Valid for ${daysLeft} days` };
}
