import { formatWhen } from "@/lib/sessions/format";
import type { IntegrationRow, SyncRun } from "@/lib/integrations/store";
import { toggleIntegrationAction, setStoreSummariesAction } from "../actions";

const SESSION_KEYS = new Set(["claude_code", "codex", "opencode"]);

/** Capability keys shown as chips. Only boolean flags are displayed. */
function capabilityChips(capabilities: Record<string, unknown>): string[] {
  return Object.entries(capabilities)
    .filter(([, value]) => typeof value === "boolean")
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value ? "yes" : "no"}`);
}

function RunLine({ run }: { run: SyncRun }) {
  return (
    <li data-ok={run.ok ? "yes" : "no"}>
      <span>{formatWhen(run.startedAt)}</span>
      <span>{run.source === "manual" ? "pasted" : "connector"}</span>
      <span>
        {run.ok ? `${run.itemsReceived} received, ${run.itemsChanged} changed` : run.error ?? "Failed"}
      </span>
    </li>
  );
}

/** One integration: honest status, what it reads and sends, and its privacy switches. */
export function IntegrationCard({
  row,
  runs,
}: {
  row: IntegrationRow;
  runs: SyncRun[];
}) {
  const sessionTool = SESSION_KEYS.has(row.key);
  const chips = capabilityChips(row.capabilities);
  return (
    <article className="tk-panel int-card" data-status={row.enabled ? row.status : "disabled"} aria-labelledby={`int-${row.key}`}>
      <header className="int-head">
        <div>
          <h2 id={`int-${row.key}`}>{row.label}</h2>
          <p className="int-source">{row.dataSource}</p>
        </div>
        <span className="int-status" data-status={row.enabled ? row.status : "disabled"}>
          {row.enabled ? row.status : "Disabled"}
        </span>
      </header>

      <dl className="int-facts">
        <dt>Last attempt</dt>
        <dd>{formatWhen(row.lastAttemptAt)}</dd>
        <dt>Last success</dt>
        <dd>{formatWhen(row.lastSuccessAt)}</dd>
        <dt>Sends</dt>
        <dd>{row.sends}</dd>
      </dl>

      {row.lastError ? (
        <p className="int-error" role="note">Last error: {row.lastError}</p>
      ) : null}

      {chips.length > 0 ? (
        <ul className="int-chips" aria-label={`${row.label} capabilities`}>
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      ) : null}

      <form action={toggleIntegrationAction} className="int-row">
        <input type="hidden" name="key" value={row.key} />
        <input type="hidden" name="enabled" value={row.enabled ? "0" : "1"} />
        <button type="submit" className="tk-button">
          {row.enabled ? "Disable" : "Enable"}
        </button>
        <span className="int-hint">
          {row.enabled ? "Reports are accepted." : "Reports from this integration are refused."}
        </span>
      </form>

      {sessionTool ? (
        <form action={setStoreSummariesAction} className="int-privacy">
          <input type="hidden" name="key" value={row.key} />
          <input type="hidden" name="store_summaries" value={row.privacy.store_summaries ? "0" : "1"} />
          <p>
            <strong>Store summaries:</strong> {row.privacy.store_summaries ? "on" : "off (default)"}.
            Transcripts are never stored in either setting.
          </p>
          <button type="submit" className="tk-button">
            {row.privacy.store_summaries ? "Turn summaries off and clear them" : "Turn summaries on"}
          </button>
        </form>
      ) : null}

      <details className="int-runs">
        <summary>Recent runs ({runs.length})</summary>
        {runs.length === 0 ? (
          <p className="int-hint">No runs yet.</p>
        ) : (
          <ul>
            {runs.map((run) => (
              <RunLine key={run.id} run={run} />
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}
