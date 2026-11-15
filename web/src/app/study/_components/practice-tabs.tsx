import { EntityPanel } from "@/components/track/entity-panel";
import { listRows } from "@/lib/crud";
import { daysUntil, todayStr } from "@/lib/dates";

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

/** Study sessions: minutes studied and questions attempted, as before. */
export function PracticeTab() {
  return (
    <EntityPanel
      entityKey="study_sessions"
      title="Study sessions"
      description="Minutes studied and questions attempted. Accuracy is worked out from these."
      rows={listRows("study_sessions")}
      columns={[
        { name: "date" },
        { name: "subject" },
        { name: "minutes" },
        { name: "questions" },
        { name: "correct" },
        {
          name: "accuracy",
          label: "Accuracy",
          render: (row) =>
            Number(row.questions) > 0
              ? `${percent(Number(row.correct ?? 0), Number(row.questions))}%`
              : "—",
        },
        { name: "notes" },
      ]}
    />
  );
}

/** Exams: the countdown source. Exams also feed the calendar, so nothing is duplicated here. */
export function ExamsTab() {
  const today = todayStr();
  return (
    <EntityPanel
      entityKey="exams"
      title="Exams"
      rows={listRows("exams")}
      columns={[
        { name: "name" },
        { name: "date" },
        {
          name: "in",
          label: "In",
          render: (row) => {
            const left = daysUntil(String(row.date), today);
            return left < 0 ? "Past" : left === 0 ? "Today" : `${left} d`;
          },
        },
        { name: "track" },
        { name: "target_pct" },
        { name: "score_pct", inline: true },
        { name: "notes" },
      ]}
    />
  );
}

/** Mistake log: what went wrong and whether it is fixed. Linked from chapter details. */
export function MistakesTab() {
  return (
    <EntityPanel
      entityKey="mistakes"
      title="Mistake log"
      description="Write down what went wrong, then tick it once you have fixed the gap. Mistakes that name a chapter appear on that chapter's detail."
      rows={listRows("mistakes")}
      columns={[
        { name: "date" },
        { name: "subject" },
        { name: "chapter" },
        { name: "note" },
        { name: "fixed", inline: true },
      ]}
    />
  );
}
