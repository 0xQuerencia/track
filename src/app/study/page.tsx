import { BarsChart, TrendChart } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { TabbedSections, type TabSpec } from "@/components/track/tabbed";
import { daysUntil, shortDay } from "@/lib/dates";
import { listRows } from "@/lib/crud";
import {
  chapterProgress,
  lectureProgress,
  masteryBySubject,
  nextExam,
  studyMinutesByDay,
  studyTotals,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

export default function StudyPage() {
  const totals = studyTotals(7);
  const chapters = chapterProgress();
  const lectures = lectureProgress();
  const exam = nextExam();
  const days = exam ? daysUntil(String(exam.date)) : null;

  const overview = (
    <>
      <StatGrid>
        <StatCard label="Study, 7 days" value={totals.minutes} suffix=" min" />
        <StatCard label="Questions, 7 days" value={totals.questions} />
        <StatCard label="Accuracy, 7 days" value={totals.accuracy} suffix="%" />
        <StatCard
          label="Mastered chapters"
          value={chapters.mastered}
          hint={`of ${chapters.total} · ${chapters.covered} covered`}
        />
      </StatGrid>
      {exam ? (
        <Panel title="Next exam">
          <p className="tk-callout">
            <strong>{String(exam.name)}</strong> on {shortDay(String(exam.date))}
            {days !== null ? ` · ${days === 0 ? "today" : `${days} days away`}` : ""}
            {exam.target_pct != null ? ` · target ${String(exam.target_pct)}%` : ""}
          </p>
        </Panel>
      ) : null}
      <SplitPanels>
        <Panel title="Mastery by subject" description="Average mastery of each subject’s chapters.">
          <BarsChart
            data={masteryBySubject()}
            series={[{ key: "value" }]}
            emptyNote="No mastery recorded yet. Update chapters in the Syllabus tab."
          />
        </Panel>
        <Panel title="Study minutes, 14 days">
          <TrendChart data={studyMinutesByDay(14)} />
        </Panel>
      </SplitPanels>
    </>
  );

  const tabs: TabSpec[] = [
    { id: "overview", label: "Overview", content: overview },
    {
      id: "syllabus",
      label: "Syllabus",
      content: (
        <EntityPanel
          entityKey="chapters"
          title="Syllabus"
          description="Covered means taught or read; mastery is how well you can actually solve it. The Class 12 PCM list is a starter: check it against the official CBSE syllabus and edit freely."
          rows={listRows("chapters")}
          limit={120}
          columns={[
            { name: "subject" },
            { name: "klass" },
            { name: "name" },
            { name: "track" },
            { name: "priority", inline: true },
            { name: "done", inline: true },
            { name: "mastery", inline: true },
          ]}
        />
      ),
    },
    {
      id: "lectures",
      label: "Lectures",
      content: (
        <EntityPanel
          entityKey="lectures"
          title="Lectures"
          description="Watching a lecture does not count as mastery. Solve questions afterwards and record them under Practice."
          rows={listRows("lectures")}
          columns={[
            { name: "title" },
            { name: "course" },
            { name: "subject" },
            { name: "watched_min", inline: true },
            { name: "duration_min" },
            {
              name: "progress",
              label: "Watched",
              render: (row) => {
                const pct = percent(Number(row.watched_min ?? 0), Number(row.duration_min ?? 0));
                return (
                  <progress
                    max={100}
                    value={pct}
                    aria-label={`${pct}% watched`}
                    title={`${pct}%`}
                  />
                );
              },
            },
            { name: "speed" },
            { name: "url" },
          ]}
        />
      ),
    },
    {
      id: "practice",
      label: "Practice",
      content: (
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
      ),
    },
    {
      id: "exams",
      label: "Exams",
      content: (
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
                const left = daysUntil(String(row.date));
                return left < 0 ? "Past" : left === 0 ? "Today" : `${left} d`;
              },
            },
            { name: "target_pct" },
            { name: "score_pct", inline: true },
            { name: "notes" },
          ]}
        />
      ),
    },
    {
      id: "mistakes",
      label: "Mistakes",
      content: (
        <EntityPanel
          entityKey="mistakes"
          title="Mistake log"
          description="Write down what went wrong, then tick it once you have fixed the gap."
          rows={listRows("mistakes")}
          columns={[
            { name: "date" },
            { name: "subject" },
            { name: "chapter" },
            { name: "note" },
            { name: "fixed", inline: true },
          ]}
        />
      ),
    },
  ];

  return (
    <Page
      kicker="Study HQ"
      title="Study HQ"
      lede={`Boards and JEE, tracked by what you can actually solve. ${lectures.count} lectures logged, ${Math.round(lectures.watched)} of ${Math.round(lectures.duration)} min watched.`}
    >
      <TabbedSections tabs={tabs} label="Study sections" />
    </Page>
  );
}
