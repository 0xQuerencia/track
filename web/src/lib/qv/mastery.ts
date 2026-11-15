import { MIN_ASSESSED_FOR_MASTERY, type Difficulty, type QState } from "./constants";

/*
 * Question mastery for one chapter, from question outcomes only. Lectures and
 * checkpoints never raise it.
 *
 * Per assessed question: green 0.7 + 0.3 * min(1, interval / 30), yellow 0.45,
 * red 0.05; a green that is overdue keeps 80% of that (it may be forgotten).
 * Weight = difficulty (easy 0.8, medium 1, hard 1.3) * importance / 3.
 * Mastery = weighted mean * (0.6 + 0.4 * coverage), coverage = assessed / total.
 * Fewer than MIN_ASSESSED_FOR_MASTERY assessed questions gives no percentage.
 */

export type MasteryQuestion = {
  state: QState;
  interval: number;
  difficulty: Difficulty;
  importance: number;
  overdue: boolean;
};

export type Mastery = {
  total: number;
  assessed: number;
  unassessed: number;
  red: number;
  yellow: number;
  green: number;
  overdue: number;
  /** 0-100, or null when there is too little data to say. */
  mastery: number | null;
  reliability: "none" | "low" | "medium" | "high";
};

const DIFF_WEIGHT: Record<Difficulty, number> = { Easy: 0.8, Medium: 1, Hard: 1.3 };

function score(q: MasteryQuestion): number {
  if (q.state === "red") return 0.05;
  if (q.state === "yellow") return 0.45;
  const base = 0.7 + 0.3 * Math.min(1, q.interval / 30);
  return q.overdue ? base * 0.8 : base;
}

export function chapterMastery(questions: readonly MasteryQuestion[]): Mastery {
  const count = (state: QState) => questions.filter((q) => q.state === state).length;
  const assessedList = questions.filter((q) => q.state !== "unassessed");
  const assessed = assessedList.length;
  let weighted = 0;
  let weights = 0;
  for (const q of assessedList) {
    const w = DIFF_WEIGHT[q.difficulty] * (q.importance / 3);
    weighted += w * score(q);
    weights += w;
  }
  const coverage = questions.length ? assessed / questions.length : 0;
  const enough = assessed >= MIN_ASSESSED_FOR_MASTERY && weights > 0;
  return {
    total: questions.length,
    assessed,
    unassessed: count("unassessed"),
    red: count("red"),
    yellow: count("yellow"),
    green: count("green"),
    overdue: questions.filter((q) => q.overdue).length,
    mastery: enough ? Math.round(100 * (weighted / weights) * (0.6 + 0.4 * coverage)) : null,
    reliability: assessed < MIN_ASSESSED_FOR_MASTERY ? "none" : assessed < 15 ? "low" : assessed < 30 ? "medium" : "high",
  };
}
