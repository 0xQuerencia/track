import { addDays } from "../dates";
import type { Difficulty, QState, QvSettings, Rating } from "./constants";

/*
 * Deterministic spaced-repetition scheduler for the red / yellow / green scale.
 * Same inputs, same output; nothing reads the clock or the database.
 *
 *   red     next day (settings.redDays); streak resets; counts a lapse when the
 *           question had been yellow or green before
 *   yellow  settings.yellowDays; if it was on a long interval, a fraction of it
 *           (40%, at most 7 days), so a slipped question comes back soon
 *   green   first success: settings.greenDays. Afterwards the next step of the
 *           ladder above the interval it earned. Reviewed late and still green:
 *           credit for the extra gap, up to double the planned interval.
 *
 * The ladder step is then scaled: hard x0.85, easy x1.15; each past lapse x0.85
 * (at most three); weak topic (mastery < 50) x0.85; importance 4-5 x0.85,
 * 1-2 x1.15. Finally capped by exam proximity (inside the exam window the
 * interval never exceeds a third of the days left for red/yellow, half for green)
 * and by settings.maxIntervalDays. Never below one day.
 */

export type SchedInput = {
  rating: Rating;
  state: QState;
  interval: number;
  streak: number;
  lapses: number;
  difficulty: Difficulty;
  importance: number;
  /** Days between the previous attempt and this one, or null for a first attempt. */
  daysSinceLast: number | null;
  /** Chapter question mastery 0-100 when known. */
  topicMastery: number | null;
  /** Days until the nearest relevant exam, or null. */
  examDays: number | null;
  settings: QvSettings;
};

export type SchedResult = { state: Rating; interval: number; streak: number; lapses: number };

const DIFFICULTY_FACTOR: Record<Difficulty, number> = { Easy: 1.15, Medium: 1, Hard: 0.85 };

function importanceFactor(importance: number): number {
  if (importance >= 4) return 0.85;
  if (importance <= 2) return 1.15;
  return 1;
}

function nextLadderStep(base: number, ladder: readonly number[], maxInterval: number): number {
  const step = ladder.find((value) => value > base);
  return step ?? Math.min(maxInterval, Math.round(base * 1.5));
}

function examCap(rating: Rating, examDays: number | null, windowDays: number): number {
  if (examDays === null || examDays < 0 || examDays > windowDays) return Infinity;
  const divisor = rating === "green" ? 2 : 3;
  return Math.max(1, Math.floor(examDays / divisor));
}

export function schedule(input: SchedInput): SchedResult {
  const { rating, settings } = input;
  const assessedBefore = input.state !== "unassessed";

  if (rating === "red") {
    const lapsed = input.state === "yellow" || input.state === "green";
    const interval = Math.min(settings.redDays, examCap("red", input.examDays, settings.examWindowDays));
    return { state: "red", interval: Math.max(1, interval), streak: 0, lapses: input.lapses + (lapsed ? 1 : 0) };
  }

  if (rating === "yellow") {
    const slipped = input.interval > 0 ? Math.min(7, Math.round(input.interval * 0.4)) : 0;
    const base = Math.max(settings.yellowDays, slipped);
    const interval = Math.min(base, examCap("yellow", input.examDays, settings.examWindowDays));
    return { state: "yellow", interval: Math.max(1, interval), streak: 0, lapses: input.lapses };
  }

  let raw: number;
  if (!assessedBefore || input.interval <= 0) {
    raw = settings.greenDays;
  } else {
    const late = input.daysSinceLast === null ? input.interval : Math.min(input.daysSinceLast, input.interval * 2);
    raw = nextLadderStep(Math.max(input.interval, late), settings.ladder, settings.maxIntervalDays);
  }
  let factor = DIFFICULTY_FACTOR[input.difficulty] * importanceFactor(input.importance);
  factor *= Math.pow(0.85, Math.min(input.lapses, 3));
  if (input.topicMastery !== null && input.topicMastery < 50) factor *= 0.85;
  let interval = Math.round(raw * factor);
  interval = Math.min(interval, settings.maxIntervalDays, examCap("green", input.examDays, settings.examWindowDays));
  return { state: "green", interval: Math.max(1, interval), streak: input.streak + 1, lapses: input.lapses };
}

export const nextReviewDate = (today: string, interval: number): string => addDays(today, Math.max(1, Math.round(interval)));

/** A hint means the question was not solved independently, so a green press counts as yellow. */
export function effectiveRating(rating: Rating, hintUsed: boolean): Rating {
  return rating === "green" && hintUsed ? "yellow" : rating;
}
