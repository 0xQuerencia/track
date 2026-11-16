import { Panel } from "@/components/track/page";
import type { RevisionPlan } from "@/lib/study/revision";
import type { OverrideRow } from "@/lib/study/queries";
import { ClearOverrideButton, OverrideButtons } from "./override-buttons";
import { RevisionLogForm } from "./revision-log-form";
import { studyHref } from "./params";

const STATE_NOTE = {
  no_chapters: "No chapters yet. Add them on the Chapters tab, then mark what you have covered.",
  none_covered: "Nothing to plan yet. Mark chapters as covered on the Chapters tab; only covered chapters are revised.",
  nothing_due: "Nothing is due for revision inside this budget. Chapters that are fine are not listed.",
  ready: "",
} as const;

const ACTION_LABEL = { snooze: "Snoozed", skip: "Skipped" } as const;

/**
 * The revision planner: budget control, the ranked plan with its reasons,
 * held chapters, and the revision log form. The plan itself comes from
 * recommendRevisions, so this component only displays it.
 */
export function RevisionPlanner({
  plan,
  overrides,
  budget,
  logChoices,
  today,
}: {
  plan: RevisionPlan;
  overrides: OverrideRow[];
  budget: number;
  logChoices: { id: number; label: string }[];
  today: string;
}) {
  const overrideByChapter = new Map(overrides.map((row) => [row.chapter_id, row]));
  const plannedCount = plan.items.filter((item) => item.planned).length;
  return (
    <>
      <Panel
        title="Plan a session"
        description="Chapters are ranked by exam pressure, mastery, spaced-repetition gaps, recent mistakes, priority and prerequisites. Each one shows why it is here."
      >
        <form method="get" action="/study" className="st-budget">
          <input type="hidden" name="tab" value="revision" />
          <label className="tk-field">
            <span>Minutes available</span>
            <input type="number" name="budget" min={15} max={600} step={5} defaultValue={budget} inputMode="numeric" />
          </label>
          <div className="tk-form-actions">
            <button type="submit" className="tk-button">
              Update plan
            </button>
          </div>
        </form>
        {plan.state === "ready" ? (
          <p className="st-plan-summary" aria-live="polite">
            {plan.plannedMinutes} of {plan.budgetMinutes} minutes planned · {plannedCount} of {plan.items.length}{" "}
            chapters fit
          </p>
        ) : (
          <p className="tk-empty">{STATE_NOTE[plan.state]}</p>
        )}

        {plan.items.length > 0 ? (
          <ol className="st-plan">
            {plan.items.map((item, index) => {
              const override = overrideByChapter.get(item.chapterId);
              return (
                <li key={item.chapterId} data-planned={item.planned} id={`revision-${item.chapterId}`}>
                  <div className="st-plan-head">
                    <span className="st-rank">{index + 1}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.subject} · {item.track} · {item.estMinutes} min
                      </small>
                    </div>
                    <span className="st-score" aria-label={`Score ${item.score}`}>
                      {item.score}
                    </span>
                  </div>
                  <div className="st-chips">
                    {item.pinned ? <span className="st-chip" data-kind="pin">Pinned</span> : null}
                    <span className="st-chip" data-kind={item.planned ? "fit" : "over"}>
                      {item.planned ? "In budget" : "Over budget"}
                    </span>
                  </div>
                  <ul className="st-reasons">
                    {item.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="st-plan-foot">
                    {override ? (
                      <ClearOverrideButton id={override.id} name={item.name} />
                    ) : (
                      <OverrideButtons chapterId={item.chapterId} name={item.name} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </Panel>

      {plan.held.length > 0 ? (
        <Panel title="Held out of the plan" description="Snoozed and skipped chapters return on their date, or clear now.">
          <ul className="tk-list">
            {plan.held.map((item) => {
              const row = overrides.find((o) => o.chapter_id === item.chapterId);
              return (
                <li key={item.chapterId}>
                  <span>
                    {item.name}
                    <small>
                      {" "}· {ACTION_LABEL[item.action]} until {item.until}
                    </small>
                  </span>
                  {row ? <ClearOverrideButton id={row.id} name={item.name} /> : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title="Log a revision"
        description="Enter mastery only when you have judged it. Time studied never changes mastery."
      >
        {logChoices.length === 0 ? (
          <p className="tk-empty-small">Add chapters first, then log revisions here.</p>
        ) : (
          <RevisionLogForm chapters={logChoices} today={today} />
        )}
        <p className="tk-more">
          The revision log for each chapter is on its detail, from the Chapters tab.{" "}
          <a href={studyHref({ tab: "chapters" })}>Go to chapters</a>
        </p>
      </Panel>
    </>
  );
}
