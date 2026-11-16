import { BarsChart, TrendChart } from "@/components/track/charts";
import { Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { shortDay } from "@/lib/dates";
import { listRows } from "@/lib/crud";
import { summarizeMocks } from "@/lib/study/analytics";
import { loadMockRows } from "@/lib/study/queries";
import { RecordPanel, type RecordColumn } from "./record-panel";

const pct = (scored: number, total: number): string =>
  total > 0 ? `${Math.round((scored / total) * 100)}%` : "—";

const columns: RecordColumn[] = [
  { label: "Date", render: (row) => shortDay(String(row.date)) },
  { label: "Test", render: (row) => String(row.name) },
  { label: "Kind", render: (row) => String(row.kind ?? "—") },
  {
    label: "Score",
    render: (row) => `${Number(row.scored)} / ${Number(row.total_marks)}`,
  },
  {
    label: "Accuracy",
    render: (row) => pct(Number(row.scored), Number(row.total_marks)),
  },
  { label: "Physics", render: (row) => (row.physics === null ? "—" : String(row.physics)) },
  { label: "Chemistry", render: (row) => (row.chemistry === null ? "—" : String(row.chemistry)) },
  { label: "Maths", render: (row) => (row.maths === null ? "—" : String(row.maths)) },
  { label: "Minutes", render: (row) => (row.duration_min === null ? "—" : String(row.duration_min)) },
  { label: "Notes", render: (row) => String(row.notes ?? "—") },
];

/** The Mocks tab: score history, subject marks, the add form and the test log. */
export function MocksTab() {
  const newestFirst = loadMockRows(200);
  const summary = summarizeMocks(newestFirst);
  const trend = newestFirst
    .slice()
    .reverse()
    .flatMap((row) => {
      const value = row.total_marks > 0 ? Math.round((row.scored / row.total_marks) * 100) : null;
      return value === null ? [] : [{ date: row.date, value }];
    });
  const subjectBars = newestFirst
    .slice(0, 12)
    .reverse()
    .map((row) => ({
      name: shortDay(row.date),
      Physics: row.physics ?? 0,
      Chemistry: row.chemistry ?? 0,
      Maths: row.maths ?? 0,
    }));
  const hasSubjects = subjectBars.some((row) => row.Physics || row.Chemistry || row.Maths);
  const rows = listRows("mock_tests");

  return (
    <>
      <StatGrid>
        <StatCard label="Tests logged" value={summary ? summary.count : 0} />
        <StatCard
          label="Latest score"
          value={summary?.latest.pct ?? null}
          suffix="%"
          hint={summary ? `${summary.latest.name} · ${summary.latest.kind}` : "Add a test to start"}
        />
        <StatCard label="Average, last 5" value={summary?.averagePct ?? null} suffix="%" />
        <StatCard
          label="Change vs previous"
          value={summary?.changePts ?? null}
          suffix=" pts"
          tone={summary && summary.changePts !== null && summary.changePts < 0 ? "negative" : undefined}
          hint={summary?.bestPct != null ? `best ${summary.bestPct}%` : undefined}
        />
      </StatGrid>
      <Panel title="Score trend" description="Percentage of total marks for each test, by date.">
        <TrendChart data={trend} emptyNote="Log at least two tests to see a trend." />
      </Panel>
      <Panel title="Subject marks, last 12 tests" description="Raw marks per subject, as entered. Subject totals are not stored, so these are not percentages.">
        {hasSubjects ? (
          <BarsChart
            data={subjectBars}
            series={[{ key: "Physics" }, { key: "Chemistry" }, { key: "Maths" }]}
            emptyNote="Enter subject marks on a test to chart them."
          />
        ) : (
          <p className="tk-empty-small">No subject marks entered yet.</p>
        )}
      </Panel>
      <RecordPanel
        entityKey="mock_tests"
        title="Mock tests"
        description="Scored cannot be more than total marks. Subject marks are optional."
        rows={rows}
        columns={columns}
        chapters={[]}
      />
    </>
  );
}
