import { InlineField } from "@/components/track/row-controls";
import { getEntity } from "@/lib/entities";
import { shortDay } from "@/lib/dates";
import type { SourceOption } from "@/lib/plans/contributions";
import { contributionStates, goalProgress } from "@/lib/plans/goal-progress";
import { MAX_GOAL_DEPTH } from "@/lib/plans/constants";
import { parentChangeError, type GoalIndex, type TreeNode } from "@/lib/plans/hierarchy";
import { reviewStatus } from "@/lib/plans/goals";
import { ContributionForm, ContributionRow, GoalControls } from "./goal-controls";
import { GoalForm, ReviewDialog } from "./goal-forms";
import { ProgressMeter } from "./progress-meter";

export type GoalRow = {
  id: number;
  title: string;
  area: string | null;
  kind: string | null;
  status: string;
  target_date: string | null;
  start_date: string | null;
  review_cadence: string | null;
  last_reviewed_at: string | null;
  parent_id: number | null;
  notes: string | null;
};

export type GoalTreeContext = {
  today: string;
  index: GoalIndex;
  goals: { id: number; title: string }[];
  options: SourceOption[];
};

/** One goal and, nested under it, its sub-goals. Server-rendered from real rows. */
export function GoalNode({
  node,
  ctx,
}: {
  node: TreeNode<GoalRow>;
  ctx: GoalTreeContext;
}) {
  const goal = node.row;
  const progress = goalProgress(goal.id, ctx.today);
  const states = contributionStates(goal.id, ctx.today);
  const review = reviewStatus(goal.review_cadence, goal.last_reviewed_at, ctx.today);
  const statusField = getEntity("goals")?.fields.find((field) => field.name === "status");
  const canNest = node.depth < MAX_GOAL_DEPTH;
  const moveTargets = ctx.goals.filter(
    (candidate) => parentChangeError(ctx.index, goal.id, candidate.id) === null,
  );
  const meta = [goal.kind, goal.area, goal.target_date ? `Target ${shortDay(goal.target_date)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="pl-goal" id={`goals-${goal.id}`} data-depth={node.depth}>
      <div className="pl-goal-head">
        <div>
          <h3>{goal.title}</h3>
          {meta ? <p className="pl-goal-meta">{meta}</p> : null}
          {goal.notes ? <p className="pl-goal-notes">{goal.notes}</p> : null}
        </div>
        {statusField ? (
          <InlineField
            entityKey="goals"
            id={goal.id}
            field={statusField}
            value={goal.status}
          />
        ) : null}
      </div>

      <ProgressMeter progress={progress} label={`Progress of ${goal.title}`} />

      <div className="pl-review-row">
        <span className={review.due ? "pl-badge" : "pl-muted"}>{review.text}</span>
        <ReviewDialog goalId={goal.id} title={goal.title} />
      </div>

      <details className="pl-disclosure">
        <summary>
          Tracked work <span className="tk-count">{states.length}</span>
        </summary>
        {states.length === 0 ? (
          <p className="tk-empty tk-empty-small">Nothing linked yet. Link a task, chapter, exam, habit or milestone below.</p>
        ) : (
          <ul className="pl-contributions">
            {states.map((state) => {
              const row = { id: state.id, label: state.title };
              return (
                <li key={state.id} data-done={state.done || undefined} data-missing={!state.exists || undefined}>
                  <span className="pl-contribution-title">
                    <small>{state.type}</small> {state.title}
                    {!state.exists ? <em> (record deleted, not counted)</em> : null}
                    {state.weight !== 1 ? <em> × {state.weight}</em> : null}
                  </span>
                  <span className="pl-contribution-state">
                    {state.exists ? (state.done ? "Done" : "Open") : "Missing"}
                  </span>
                  <ContributionRow
                    id={row.id}
                    manual={state.type === "manual"}
                    done={state.done}
                    label={row.label}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <ContributionForm goalId={goal.id} options={ctx.options} />
      </details>

      {canNest ? (
        <details className="pl-disclosure">
          <summary>Add sub-goal</summary>
          <GoalForm parentId={goal.id} submitLabel="Add sub-goal" />
        </details>
      ) : (
        <p className="pl-muted">Goals nest at most {MAX_GOAL_DEPTH} levels deep.</p>
      )}

      <GoalControls
        goalId={goal.id}
        title={goal.title}
        currentParent={goal.parent_id}
        moveTargets={moveTargets.filter((target) => target.id !== goal.parent_id)}
      />

      {node.children.length > 0 ? (
        <ul className="pl-goal-children">
          {node.children.map((child) => (
            <GoalNode key={child.row.id} node={child} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
