import Link from "next/link";
import { EntityForm } from "@/components/track/entity-form";
import { FocusTimer } from "@/components/track/focus-timer";
import { TrendChart } from "@/components/track/charts";
import { Rise } from "@/components/track/rise";
import { StatCard } from "@/components/track/stat-card";
import {
  WidgetBoard,
  type LayoutPreset,
  type WidgetSpec,
} from "@/components/track/widget-board";
import {
  clockTime,
  daysUntil,
  greeting,
  longToday,
  shortDay,
  todayStr,
} from "@/lib/dates";
import { getEntity } from "@/lib/entities";
import {
  activeProjects,
  focusTotals,
  habitsToday,
  latestHealth,
  masteryBySubject,
  nextExam,
  studyMinutesByDay,
  studyTotals,
  taskCounts,
  tasksDueByToday,
  timelineToday,
  topPriorities,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const num = (value: unknown) => (typeof value === "number" ? value : null);

export default function CommandCenter() {
  const priorities = topPriorities(3);
  const dueToday = tasksDueByToday();
  const exam = nextExam();
  const studyToday = studyTotals(1);
  const study7 = studyTotals(7);
  const focusToday = focusTotals(1);
  const habits = habitsToday();
  const tasks = taskCounts();
  const health = latestHealth();
  const projects = activeProjects(3);
  const timeline = timelineToday();
  const mastery = masteryBySubject();
  const weakest = [...mastery].sort((a, b) => a.value - b.value)[0];
  const taskEntity = getEntity("tasks");
  const titleField = taskEntity?.fields.filter((f) => f.name === "title") ?? [];
  const examDays = exam ? daysUntil(String(exam.date)) : null;

  const widgets: WidgetSpec[] = [
    {
      id: "priorities",
      title: "Today’s priorities",
      wide: true,
      content: (
        <>
          {priorities.length === 0 ? (
            <p className="tk-empty">Nothing queued. Capture a task below.</p>
          ) : (
            <ol className="tk-priorities">
              {priorities.map((task) => (
                <li key={task.id} data-priority={String(task.priority)}>
                  <span>{String(task.title)}</span>
                  <small>
                    {String(task.priority)}
                    {task.due ? ` · due ${shortDay(String(task.due))}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          )}
          <div className="tk-capture">
            <EntityForm
              entityKey="tasks"
              fields={titleField}
              defaults={{}}
              submitLabel="Capture task"
            />
          </div>
        </>
      ),
    },
    {
      id: "focus",
      title: "Focus timer",
      content: (
        <>
          <FocusTimer compact />
          <p className="tk-widget-foot">
            Today: <b>{Math.round(focusToday.minutes)} min</b> focused
          </p>
        </>
      ),
    },
    {
      id: "exam",
      title: "Next exam",
      content: exam ? (
        <div className="tk-exam">
          <strong className="tk-exam-days">
            {examDays === 0 ? "Today" : `${examDays} days`}
          </strong>
          <span>{String(exam.name)} · {shortDay(String(exam.date))}</span>
          {num(exam.target_pct) !== null ? (
            <small>Target {String(exam.target_pct)}%</small>
          ) : null}
          {weakest ? (
            <small>
              Weakest subject: {weakest.name} ({weakest.value}% mastery)
            </small>
          ) : null}
        </div>
      ) : (
        <p className="tk-empty">
          No upcoming exam. <Link href="/study">Add one in Study HQ.</Link>
        </p>
      ),
    },
    {
      id: "study",
      title: "Study today",
      content: (
        <div className="tk-mini-stats">
          <StatCard label="Minutes" value={studyToday.minutes} />
          <StatCard label="Questions" value={studyToday.questions} />
          <StatCard
            label="Accuracy (7d)"
            value={study7.accuracy}
            suffix="%"
          />
        </div>
      ),
    },
    {
      id: "due",
      title: "Due today",
      content:
        dueToday.length === 0 ? (
          <p className="tk-empty">Nothing due. {tasks.open} open overall.</p>
        ) : (
          <ul className="tk-list">
            {dueToday.slice(0, 6).map((task) => (
              <li key={task.id}>
                <span>{String(task.title)}</span>
                <small>{String(task.due) < todayStr() ? "overdue" : "today"}</small>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "habits",
      title: "Habits",
      content:
        habits.total === 0 ? (
          <p className="tk-empty">
            No habits yet. <Link href="/plans">Add one in Plans.</Link>
          </p>
        ) : (
          <div className="tk-progress">
            <strong>
              {habits.done}/{habits.total}
            </strong>
            <progress max={habits.total} value={habits.done} aria-label="Habits done today" />
          </div>
        ),
    },
    {
      id: "health",
      title: "Sleep and energy",
      content: health ? (
        <div className="tk-mini-stats">
          <StatCard label="Sleep" value={num(health.sleep_hours)} decimals={1} suffix=" h" />
          <StatCard label="Energy" value={num(health.energy)} suffix="/5" />
        </div>
      ) : (
        <p className="tk-empty">
          No check-in yet. <Link href="/health">Log today.</Link>
        </p>
      ),
    },
    {
      id: "projects",
      title: "Active projects",
      content:
        projects.length === 0 ? (
          <p className="tk-empty">
            None active. <Link href="/projects">Add a project.</Link>
          </p>
        ) : (
          <ul className="tk-list">
            {projects.map((project) => (
              <li key={project.id}>
                <span>{String(project.name)}</span>
                <small>{String(project.milestone ?? "")}</small>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "timeline",
      title: "Today’s timeline",
      content:
        timeline.length === 0 ? (
          <p className="tk-empty">Nothing recorded yet today.</p>
        ) : (
          <ol className="tk-timeline">
            {timeline.map((item, index) => (
              <li key={`${item.createdAt}-${index}`}>
                <time>{clockTime(item.createdAt)}</time>
                <b>{item.kind}</b>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        ),
    },
    {
      id: "trend",
      title: "Study minutes, 14 days",
      wide: true,
      content: <TrendChart data={studyMinutesByDay(14)} />,
    },
  ];

  const ids = widgets.map((w) => w.id);
  const presets: LayoutPreset[] = [
    { id: "balanced", label: "Balanced", order: ids, hidden: [] },
    {
      id: "study",
      label: "Study focus",
      order: ["exam", "focus", "study", "trend", "priorities", "due", ...ids],
      hidden: ["health", "projects", "timeline"],
    },
    {
      id: "minimal",
      label: "Minimal",
      order: ["priorities", "focus", "exam", ...ids],
      hidden: ids.filter((id) => !["priorities", "focus", "exam"].includes(id)),
    },
  ];

  return (
    <main className="tk-page" id="main">
      <header className="tk-page-head">
        <p className="tk-kicker">{longToday()}</p>
        <h1>
          {greeting()}
          {process.env.TRACK_NAME ? `, ${process.env.TRACK_NAME}` : ""}
        </h1>
        <p className="tk-lede">
          Plan something, do it, record what happened, then improve tomorrow.
        </p>
      </header>
      <Rise className="tk-stack">
        <WidgetBoard widgets={widgets} presets={presets} />
      </Rise>
    </main>
  );
}
