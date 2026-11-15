import { Page, Panel, SplitPanels } from "@/components/track/page";
import { getDb } from "@/lib/db";
import { listTokens } from "@/lib/integrations/tokens";
import { formatWhen } from "@/lib/sessions/format";
import { TokenForm } from "./_components/token-form";
import { revokeIntegrationTokenAction } from "./actions";
import "@/styles/integrations.css";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const tokens = listTokens(getDb());
  const active = tokens.filter((token) => token.revokedAt === null);

  return (
    <Page
      kicker="System"
      title="Settings"
      lede="Integration tokens for the Linux connector, and what to back up. Tokens are shown once and stored only as hashes."
    >
      <SplitPanels>
        <Panel title="Create a token" description="Choose only the scopes the machine needs. A token that is no longer needed should be revoked.">
          <TokenForm />
        </Panel>

        <Panel title="Tokens" description={`${active.length} active of ${tokens.length} listed.`}>
          {tokens.length === 0 ? (
            <p className="tk-empty">No tokens yet.</p>
          ) : (
            <div className="tk-table-wrap">
              <table className="tk-table set-table">
                <thead>
                  <tr>
                    <th scope="col">Label</th>
                    <th scope="col">Scopes</th>
                    <th scope="col">Created</th>
                    <th scope="col">Last used</th>
                    <th scope="col">State</th>
                    <th scope="col"><span className="tk-sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td>{token.label}</td>
                      <td>{token.scopes.join(", ") || "none"}</td>
                      <td>{formatWhen(token.createdAt)}</td>
                      <td>{formatWhen(token.lastUsedAt)}</td>
                      <td>{token.revokedAt ? `Revoked ${formatWhen(token.revokedAt)}` : "Active"}</td>
                      <td>
                        {token.revokedAt === null ? (
                          <form action={revokeIntegrationTokenAction}>
                            <input type="hidden" name="id" value={token.id} />
                            <button type="submit" className="tk-button tk-ghost tk-danger">
                              Revoke {token.label}
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </SplitPanels>

      <Panel title="Backup and export" description="Track is one SQLite file. Back it up while nothing is writing to it.">
        <ul className="set-list">
          <li>
            The database path comes from <code>TRACK_DB</code> (default <code>./data/track.db</code>). It is your
            only copy of the data.
          </li>
          <li>
            Before a schema change, Track writes a copy named <code>track.db.bak-&lt;timestamp&gt;</code> next to the
            database and keeps the newest few.
          </li>
          <li>
            For a manual copy, stop the server or make sure no import is running, then use SQLite&apos;s own backup, for
            example <code>sqlite3 data/track.db &quot;.backup /path/to/track-copy.db&quot;</code>. Copying the file with
            the server running can miss recent writes that are still in the WAL file.
          </li>
          <li>
            Connector tokens are not in the database file in readable form (only their hashes are), so a copy alone
            cannot reconnect a machine. Keep a token in that machine&apos;s environment, and revoke any you no longer
            use.
          </li>
          <li>
            Export: this build has no export button. The database file is the export.
          </li>
        </ul>
      </Panel>
    </Page>
  );
}
