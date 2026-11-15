import { Panel } from "@/components/track/page";
import { listRows } from "@/lib/crud";
import { contributionOptions } from "@/lib/plans/contributions";
import { buildGoalIndex, buildGoalTree } from "@/lib/plans/hierarchy";
import { todayStr } from "@/lib/dates";
import { GoalForm } from "./goal-forms";
import { GoalNode, type GoalRow, type GoalTreeContext } from "./goal-node";

/** Goals as a tree: progress, tracked work, sub-goals and reviews. */
export function GoalsTab() {
  const goals = listRows("goals") as unknown as GoalRow[];
  const index = buildGoalIndex(goals);
  const tree = buildGoalTree(goals);
  const ctx: GoalTreeContext = {
    today: todayStr(),
    index,
    goals: goals.map((goal) => ({ id: goal.id, title: goal.title })),
    options: contributionOptions(),
  };

  return (
    <div className="pl-goals">
      <Panel
        title="Goals"
        description="A goal's progress counts only what is tracked under it: finished tasks, chapters, exams, habits with a weekly target, manual milestones, and sub-goals. Nothing is estimated."
      >
        <details className="tk-add" open={goals.length === 0}>
          <summary>Add goal</summary>
          <GoalForm parentId={null} submitLabel="Add goal" />
        </details>
        {tree.length === 0 ? (
          <p className="tk-empty">No goals yet. Start with a long-term goal, then break it into quarters, months or milestones.</p>
        ) : (
          <ul className="pl-goal-tree">
            {tree.map((node) => (
              <GoalNode key={node.row.id} node={node} ctx={ctx} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
