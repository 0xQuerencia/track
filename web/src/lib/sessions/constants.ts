/** Shared constants for AI session records. Client-safe: no database imports. */

export const SESSION_TOOLS = [
  "claude_code",
  "codex",
  "opencode",
  "antigravity",
  "other",
] as const;
export type SessionTool = (typeof SESSION_TOOLS)[number];

export const SESSION_STATUSES = ["historical", "running_verified", "unknown"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  historical: "Saved record",
  running_verified: "Running (verified)",
  unknown: "Unknown",
};

export const SESSION_TOOL_LABELS: Record<SessionTool, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  other: "Other",
};

/** Largest number of sessions one import request may carry. */
export const MAX_SESSIONS_PER_REQUEST = 5000;

/** Rows per page in the explorer. */
export const PAGE_SIZE = 50;

/** Groups per page in grouped views, and sessions previewed inside each group. */
export const GROUP_PAGE_SIZE = 50;
export const GROUP_PREVIEW_SIZE = 5;

export const SESSION_EXPORT_NOTE =
  "Only metadata is stored: ids, titles, folder hints, timestamps and status. Transcripts are never stored.";
