import type { SessionTool } from "../sessions/constants";

/*
 * Static description of each integration. Runtime state (enabled, status,
 * timestamps, privacy) lives in the integrations table; this file only holds
 * the labels and the honest description of what each one reads and sends.
 */

export const INTEGRATION_KEYS = [
  "local_linux",
  "git",
  "github",
  "claude_code",
  "codex",
  "opencode",
  "antigravity",
] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export const INTEGRATION_STATUSES = ["Not connected", "Connected", "Stale", "Error"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/** A Connected integration whose last success is older than this shows as Stale. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type IntegrationMeta = {
  label: string;
  dataSource: string;
  sends: string;
};

export const INTEGRATION_META: Record<IntegrationKey, IntegrationMeta> = {
  local_linux: {
    label: "Linux connector",
    dataSource: "The track-connector script on this Linux account",
    sends: "Heartbeat (ping) and process detection results",
  },
  git: {
    label: "Git repositories",
    dataSource: "Repos found under allowlisted folders (read-only git commands)",
    sends: "Remote URL without credentials, branch, last commit id, date and subject",
  },
  github: {
    label: "GitHub",
    dataSource: "Repo events pasted by hand. No server-side GitHub calls.",
    sends: "Nothing automatic. Events are imported from a pasted JSON file.",
  },
  claude_code: {
    label: "Claude Code",
    dataSource: "Session file names, folder and timestamps in ~/.claude/projects",
    sends: "Session id, folder hint, timestamps, status and resume command",
  },
  codex: {
    label: "Codex",
    dataSource: "Session metadata in ~/.codex/sessions",
    sends: "Session id, folder hint, timestamps, status and resume command",
  },
  opencode: {
    label: "OpenCode",
    dataSource: "Session metadata in the OpenCode data folder",
    sends: "Session id, folder hint, timestamps, status and resume command",
  },
  antigravity: {
    label: "Antigravity",
    dataSource: "Not supported yet. The connector reports it as unsupported.",
    sends: "Nothing",
  },
};

export const TOOL_TO_INTEGRATION: Record<SessionTool, IntegrationKey> = {
  claude_code: "claude_code",
  codex: "codex",
  opencode: "opencode",
  antigravity: "antigravity",
  other: "local_linux",
};

export function isIntegrationKey(value: string): value is IntegrationKey {
  return (INTEGRATION_KEYS as readonly string[]).includes(value);
}
