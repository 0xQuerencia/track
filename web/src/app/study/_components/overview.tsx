import Link from "next/link";
import { BarsChart, TrendChart } from "@/components/track/charts";
import { Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { daysUntil, shortDay, todayStr } from "@/lib/dates";
import { getTodayStudyTargets, getWeakestSubjects } from "@/lib/study";
import {
  loadOpenMistakeGroups,
  loadQuestionGroups,
  loadUpcomingExams,
  loadWeakInputs,
} from "@/lib/study/queries";
import { subjectPerformance } from "@/lib/study/analytics";
import { chapterProgress, lectureProgress, masteryBySubject, studyMinutesByDay, studyTotals } from "@/lib/queries";
import { studyHref } from "./params";

const dayLabel = (days: number): string =>
  days < 0 ? `${Math.abs(days)} d overdue` : days === 0 ? "Today" : `${days} d`;

const STATE_TEXT = {
  no_chapters: "No chapters yet. Add them on the Chapters tab.",
  none_covered: "Mark chapters as covered on the Chapters tab to plan revisions.",
  nothing_due: "Nothing is due for revision today.",
  ready: "",
} as const;

/** The Overview tab: countdowns, today's targets, subject cards and trends. */
export function OverviewTab({ budget }: { budget: number }) {
  const today = todayStr();
  const totals = studyTotals(7);
  const chapters = chapterProgress();
  const lectures = lectureProgress();
  const exams = loadUpcomingExams(today);
  const targets = getTodayStudyTargets(today, budget);
  const performance = subjectPerformance(
    loadWeakInputs(),
    loadOpenMistakeGroups(),
    loadQuestionGroups(),
  );
  const weakest = getWeakestSubjects();

  return (
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

      <SplitPanels>
        <Panel title="Exam countdown" description="Nearest first. Exams also appear on the calendar.">
          {exams.length === 0 ? (
            <p className="tk-empty">No upcoming exams. Add one on the Exams tab.</p>
          ) : (
            <ol className="st-countdown">
              {exams.map((exam) => {
                const days = daysUntil(exam.date, today);
                return (
                  <li key={`${exam.name}-${exam.date}`}>
                    <strong>{exam.name}</strong>
                    <span>
                      {shortDay(exam.date)}
                      {exam.track ? ` · ${exam.track}` : ""}
                    </span>
                    <span className="st-days" data-today={days === 0 || undefined}>
                      {dayLabel(days)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel
          title="Today's study targets"
          description={`Revisions that fit ${budget} minutes, plus assignments due and lectures planned for today. Change the budget on the Revision tab.`}
        >
          <h3 className="st-subhead">Revise</h3>
          {targets.revisionState !== "ready" ? (
            <p className="tk-empty-small">{STATE_TEXT[targets.revisionState]}</p>
          ) : (
            <ul className="st-targets">
              {targets.revisions.map((item) => (
                <li key={item.chapterId}>
                  <Link href={studyHref({ tab: "revision" })}>{item.name}</Link>
                  <small>
                    {item.subject} · {item.estMinutes} min · {item.reasons.slice(0, 2).join(" · ")}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {targets.revisionState === "ready" ? (
            <p className="tk-more">
              {targets.plannedMinutes} of {targets.budgetMinutes} minutes planned.
            </p>
          ) : null}

          <h3 className="st-subhead">Assignments due</h3>
          {targets.dueAssignments.length === 0 ? (
            <p className="tk-empty-small">Nothing due today or overdue.</p>
          ) : (
            <ul className="st-targets">
              {targets.dueAssignments.map((row) => {
                const days = daysUntil(String(row.due_date), today);
                return (
                  <li key={String(row.id)}>
                    <span>{String(row.title)}</span>
                    <small>
                      {row.subject ? `${String(row.subject)} · ` : ""}
                      {dayLabel(days)} · {String(row.status)}
                    </small>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="st-subhead">Lectures planned</h3>
          {targets.lecturesPlanned.length === 0 ? (
            <p className="tk-empty-small">No lectures planned for today.</p>
          ) : (
            <ul className="st-targets">
              {targets.lecturesPlanned.map((row) => (
                <li key={String(row.id)}>
                  <span>{String(row.title)}</span>
                  <small>
                    {Number(row.watched_min ?? 0)} of {Number(row.duration_min ?? 0)} min watched
                  </small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </SplitPanels>

      <Panel
        title="Subject performance"
        description="Covered chapters, their average mastery, question accuracy and open mistakes. A subject with no data shows none."
      >
        <div className="st-subject-grid">
          {performance.map((row) => (
            <article key={row.subject} className="st-subject-card" aria-label={row.subject}>
              <h3>{row.subject === "Physical Education" ? "PE" : row.subject}</h3>
              {row.chapters === 0 ? (
                <p className="tk-empty-small">No chapters yet.</p>
              ) : (
                <dl>
                  <div>
                    <dt>Covered</dt>
                    <dd>
                      {row.covered} of {row.chapters}
                    </dd>
                  </div>
                  <div>
                    <dt>Avg mastery</dt>
                    <dd>{row.avgMastery === null ? "—" : `${row.avgMastery}%`}</dd>
                  </div>
                  <div>
                    <dt>Accuracy</dt>
                    <dd>
                      {row.accuracyPct === null ? "—" : `${row.accuracyPct}%`}
                      {row.attempted > 0 ? <small> of {row.attempted}</small> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Open mistakes</dt>
                    <dd>{row.openMistakes}</dd>
                  </div>
                </dl>
              )}
            </article>
          ))}
        </div>
      </Panel>

      <SplitPanels>
        <Panel
          title="Weakest subjects"
          description="Weakness is the mean of the parts with data: 100 minus average mastery of covered chapters, open mistakes out of 10, and 100 minus question accuracy."
        >
          {weakest.length === 0 ? (
            <p className="tk-empty">Not enough data yet. Mark chapters covered and log mastery or questions.</p>
          ) : (
            <ol className="st-weak-list">
              {weakest.map((row) => (
                <li key={row.subject}>
                  <strong>
                    {row.subject} · {row.weakness}
                  </strong>
                  <small>{row.summary}</small>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Mastery by subject" description="Average mastery of each subject's chapters.">
          <BarsChart
            data={masteryBySubject()}
            series={[{ key: "value" }]}
            emptyNote="No mastery recorded yet. Update chapters on the Chapters tab."
          />
        </Panel>
      </SplitPanels>

      <Panel title="Study minutes, 14 days">
        <TrendChart data={studyMinutesByDay(14)} />
      </Panel>
      <p className="tk-more">
        {lectures.count} lectures logged, {Math.round(lectures.watched)} of {Math.round(lectures.duration)} min
        watched.
      </p>
    </>
  );
}
