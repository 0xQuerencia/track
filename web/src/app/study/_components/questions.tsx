import { BarsChart } from "@/components/track/charts";
import { Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { shortDay } from "@/lib/dates";
import { listRows } from "@/lib/crud";
import {
  accuracyBySubject,
  totalAccuracy,
  weakChapters,
} from "@/lib/study/analytics";
import {
  loadChapters,
  loadOpenMistakeGroups,
  loadQuestionGroups,
  loadWeakInputs,
} from "@/lib/study/queries";
import { RecordPanel, type RecordColumn } from "./record-panel";
import type { ChapterOption } from "./record-form";

const shortSubject = (subject: string): string =>
  subject === "Physical Education" ? "PE" : subject;

/** The Questions tab: accuracy from the question log, weak chapters with their inputs, and the log. */
export function QuestionsTab({ chapters }: { chapters: ChapterOption[] }) {
  const groups = loadQuestionGroups();
  const totals = totalAccuracy(groups);
  const bySubject = accuracyBySubject(groups);
  const weak = weakChapters(loadWeakInputs(), loadOpenMistakeGroups(), groups).slice(0, 10);
  const names = new Map(loadChapters().map((row) => [row.id, row.name]));

  const columns: RecordColumn[] = [
    { label: "Date", render: (row) => shortDay(String(row.date)) },
    { label: "Subject", render: (row) => String(row.subject) },
    {
      label: "Chapter",
      render: (row) =>
        row.chapter_id === null ? "—" : (names.get(Number(row.chapter_id)) ?? "Removed chapter"),
    },
    { label: "Attempted", render: (row) => String(row.attempted) },
    { label: "Correct", render: (row) => String(row.correct ?? 0) },
    {
      label: "Accuracy",
      render: (row) =>
        Number(row.attempted) > 0
          ? `${Math.round((Number(row.correct ?? 0) / Number(row.attempted)) * 100)}%`
          : "—",
    },
    { label: "Source", render: (row) => String(row.source ?? "—") },
  ];

  return (
    <>
      <StatGrid>
        <StatCard label="Questions attempted" value={totals.attempted} />
        <StatCard label="Correct" value={totals.correct} />
        <StatCard label="Accuracy" value={totals.accuracyPct} suffix="%" />
      </StatGrid>
      <Panel title="Accuracy by subject" description="Correct answers out of attempted, from the question log.">
        <BarsChart
          data={bySubject.map((row) => ({ name: shortSubject(row.subject), accuracy: row.accuracyPct ?? 0 }))}
          series={[{ key: "accuracy" }]}
          emptyNote="Log questions below to see accuracy by subject."
        />
      </Panel>
      <Panel
        title="Weak chapters"
        description="Weakness is the mean of: 100 minus mastery (covered chapters), open mistakes out of 5, and 100 minus question accuracy. Only the parts with data are averaged, and each chapter lists its inputs."
      >
        {weak.length === 0 ? (
          <p className="tk-empty">No chapter has mastery, questions or open mistakes to compare yet.</p>
        ) : (
          <ol className="st-weak-list">
            {weak.map((item) => (
              <li key={item.chapterId}>
                <strong>
                  {item.name} · {item.weakness}
                </strong>
                <small>
                  {item.subject} · {item.summary || "No inputs"}
                </small>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <RecordPanel
        entityKey="question_stats"
        title="Question log"
        description="Log questions by subject, optionally by chapter. Correct cannot exceed attempted."
        rows={listRows("question_stats")}
        columns={columns}
        chapters={chapters}
      />
    </>
  );
}
