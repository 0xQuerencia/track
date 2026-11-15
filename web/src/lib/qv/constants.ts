/** Vocabulary and defaults for the Question Vault. No database or Node imports. */

export const RATINGS = ["red", "yellow", "green"] as const;
export type Rating = (typeof RATINGS)[number];
export const STATES = ["unassessed", ...RATINGS] as const;
export type QState = (typeof STATES)[number];

export const STATE_LABEL: Record<QState, string> = {
  unassessed: "Unassessed",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
};
export const RATING_HINT: Record<Rating, string> = {
  red: "Could not solve it alone",
  yellow: "Partly there",
  green: "Solved it independently",
};

export const QUESTION_TYPES = ["MCQ", "Multi-correct", "Numerical", "Integer", "Subjective", "Assertion-Reason", "Match", "Other"] as const;
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const SOURCES = ["NCERT", "PYQ", "PW module", "Sample paper", "Mock test", "Personal notes", "Other"] as const;
export const EXAM_CATEGORIES = ["General", "CBSE", "JEE Main", "JEE Advanced"] as const;
export const MISTAKE_CATEGORIES = [
  "Conceptual misunderstanding",
  "Formula forgotten",
  "Calculation error",
  "Misread question",
  "Wrong method",
  "Time-management issue",
  "Careless mistake",
  "Incomplete solution",
  "Other",
] as const;

export const MODES = ["due", "red", "yellow", "chapter", "subject", "mistakes", "pyq", "timed", "mixed", "random"] as const;
export type PracticeMode = (typeof MODES)[number];
export const MODE_LABEL: Record<PracticeMode, string> = {
  due: "Due today",
  red: "Red only",
  yellow: "Yellow only",
  chapter: "One chapter",
  subject: "One subject",
  mistakes: "Mistakes only",
  pyq: "PYQ practice",
  timed: "Timed set",
  mixed: "Mixed revision",
  random: "Random",
};

/** Fewer assessed questions than this and a chapter shows no mastery percentage. */
export const MIN_ASSESSED_FOR_MASTERY = 5;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_BATCH = 20;

export type QvSettings = {
  redDays: number;
  yellowDays: number;
  greenDays: number;
  ladder: number[];
  maxIntervalDays: number;
  examWindowDays: number;
  maxDailyReviews: number;
  weekdayMinutes: number;
  weekendMinutes: number;
  dayStart: string;
  dayEnd: string;
  minutesPerQuestion: number;
  practiceBlockQuestions: number;
  taskMinutes: number;
  timezone: string;
  planTime: string;
  reminderTime: string;
  eveningTime: string;
  weeklyTime: string;
  weeklyDay: number;
  jobsEnabled: boolean;
};

export const DEFAULT_SETTINGS: QvSettings = {
  redDays: 1,
  yellowDays: 3,
  greenDays: 7,
  ladder: [1, 3, 7, 14, 30, 60],
  maxIntervalDays: 120,
  examWindowDays: 60,
  maxDailyReviews: 40,
  weekdayMinutes: 180,
  weekendMinutes: 300,
  dayStart: "06:00",
  dayEnd: "22:00",
  minutesPerQuestion: 3,
  practiceBlockQuestions: 15,
  taskMinutes: 45,
  timezone: "Asia/Kolkata",
  planTime: "05:00",
  reminderTime: "06:00",
  eveningTime: "21:00",
  weeklyTime: "20:00",
  weeklyDay: 0,
  jobsEnabled: true,
};
