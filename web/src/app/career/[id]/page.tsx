import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmActionButton } from "@/components/track/confirm-action";
import { Page, Panel, SplitPanels } from "@/components/track/page";
import { RelatedLinks } from "@/components/track/related-links";
import { deadlineBadge } from "@/lib/career/deadlines";
import { getOpportunity, opportunityHistory } from "@/lib/career/queries";
import { shortDay, todayStr } from "@/lib/dates";
import { listLinks } from "@/lib/links";
import { safeHttpUrl, urlLabel } from "@/lib/knowledge/urls";
import {
  deleteOpportunityAction,
  updateOpportunityAction,
} from "../actions";
import { DeadlineBadgeChip } from "../_components/deadline-badge";
import { HistoryTimeline } from "../_components/history-timeline";
import { OpportunityForm } from "../_components/opportunity-form";
import { OpportunityNotes } from "../_components/opportunity-views";
import { StatusSelect } from "../_components/status-select";
import "@/styles/career.css";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const row = getOpportunity(id);
  if (!row) notFound();

  const today = todayStr();
  const badge = deadlineBadge(row.deadline, row.status, today);
  const link = row.url ? safeHttpUrl(row.url) : null;

  return (
    <Page kicker={row.kind} title={row.title} lede={row.org ?? undefined}>
      <p className="career-back">
        <Link href="/career">← All opportunities</Link>
      </p>

      <section className="tk-panel career-summary" aria-label="Summary">
        <dl className="career-facts">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusSelect id={row.id} status={row.status} label={row.title} />
            </dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              {row.deadline ? shortDay(row.deadline) : "None set"}{" "}
              <DeadlineBadgeChip badge={badge} />
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{row.priority ?? "—"}</dd>
          </div>
          <div>
            <dt>Achieved on</dt>
            <dd>{row.achieved_on ? shortDay(row.achieved_on) : "—"}</dd>
          </div>
          <div>
            <dt>Link</dt>
            <dd>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer">
                  {urlLabel(link)}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        <div className="career-notes-block">
          <h3>Notes</h3>
          <OpportunityNotes notes={row.notes} />
        </div>
      </section>

      <SplitPanels>
        <Panel title="Edit" description="Changing the status here also adds to the history.">
          <OpportunityForm
            action={updateOpportunityAction.bind(null, row.id)}
            submitLabel="Save changes"
            defaults={{
              title: row.title,
              org: row.org,
              kind: row.kind,
              status: row.status,
              deadline: row.deadline,
              url: row.url,
              notes: row.notes,
              priority: row.priority,
              achieved_on: row.achieved_on,
            }}
          />
          <div className="career-danger">
            <ConfirmActionButton
              label={row.title}
              action={deleteOpportunityAction.bind(null, row.id)}
            />
          </div>
        </Panel>
        <Panel title="History" description="Each status change, in order.">
          <HistoryTimeline rows={opportunityHistory(row.id)} />
        </Panel>
      </SplitPanels>

      <RelatedLinks
        type="opportunities"
        id={row.id}
        links={listLinks("opportunities", row.id)}
        title="Related records"
      />
    </Page>
  );
}
