import { Panel } from "@/components/track/page";
import type { AiCallRecord } from "@/lib/ai";
import type { AiStatus } from "@/lib/ai/types";
import { AiConsentForm } from "./ai-consent-form";

type Props = { status: AiStatus; calls: readonly AiCallRecord[] };

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function AiSettingsPanel({ status, calls }: Props) {
  const dreamer = status.consents.find((consent) => consent.feature === "dreamer");
  if (!dreamer) throw new Error("Dreamer consent status is missing.");

  return (
    <Panel
      title="AI and privacy"
      description="Track uses OpenRouter only after you opt in for a feature. The API key stays on the server."
    >
      <dl className="set-ai-status">
        <div>
          <dt>OpenRouter key</dt>
          <dd>{status.keyConfigured ? "Configured" : "Not configured"}</dd>
        </div>
        <div>
          <dt>Default model</dt>
          <dd><code>{status.defaultModel}</code></dd>
        </div>
        <div>
          <dt>Server kill switch</dt>
          <dd>{status.killSwitch ? "On: AI calls are blocked" : "Off"}</dd>
        </div>
      </dl>

      <AiConsentForm consent={dreamer} />
      <p className="set-ai-note">
        {dreamer.grantedAt ? `Granted ${when(dreamer.grantedAt)}` : "No consent has been granted."}
        {dreamer.revokedAt && !dreamer.enabled ? ` · revoked ${when(dreamer.revokedAt)}` : ""}
      </p>

      <div className="set-ai-calls">
        <h3>Recent AI calls</h3>
        {calls.length === 0 ? (
          <p className="tk-empty">No AI calls recorded.</p>
        ) : (
          <div className="tk-table-wrap">
            <table className="tk-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Feature</th>
                  <th scope="col">Model</th>
                  <th scope="col">Result</th>
                  <th scope="col">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id}>
                    <td>{when(call.at)}</td>
                    <td>{call.feature}</td>
                    <td><code>{call.model}</code></td>
                    <td>{call.ok ? "Completed" : `Failed (${call.errorCode ?? "upstream"})`}</td>
                    <td>{call.promptTokens ?? "—"} / {call.completionTokens ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="set-ai-note">This log stores model, time, token counts and result code only. It never stores prompts or responses.</p>
      </div>
    </Panel>
  );
}
