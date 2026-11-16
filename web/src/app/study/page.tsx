import { Page } from "@/components/track/page";
import { todayStr } from "@/lib/dates";
import { lectureProgress } from "@/lib/queries";
import {
  loadActiveOverrides,
  loadChapters,
  loadPlannerRevisions,
  loadPrereqEdges,
  loadRecentMistakes,
  loadUpcomingExams,
} from "@/lib/study/queries";
import { recommendRevisions } from "@/lib/study/revision";
import "@/styles/study.css";
import { StudyTabs, type StudyTab } from "./_components/study-tabs";
import { OverviewTab } from "./_components/overview";
import { ChaptersTab } from "./_components/chapters";
import { RevisionPlanner } from "./_components/revision-planner";
import { MocksTab } from "./_components/mocks";
import { QuestionsTab } from "./_components/questions";
import { LecturesTab, ResourcesTab } from "./_components/lectures-tab";
import { ExamsTab, MistakesTab, PracticeTab } from "./_components/practice-tabs";
import { chapterFilters, firstParam, parseBudget, type StudySearch } from "./_components/params";
import type { ChapterOption } from "./_components/record-form";
import { AnalyticsTab, ChapterQuestionPanel, NotebookTab, PlanTab, QvSummary, ReviewTab, SettingsTab, VaultTab } from "./_components/qv/tabs";
import "@/styles/qvault.css";

export const dynamic = "force-dynamic";

const TAB_IDS = [
  "overview",
  "plan",
  "vault",
  "review",
  "notebook",
  "analytics",
  "settings",
  "chapters",
  "revision",
  "mocks",
  "questions",
  "practice",
  "exams",
  "mistakes",
  "lectures",
  "resources",
] as const;

type Props = { searchParams: Promise<StudySearch> };

export default async function StudyPage({ searchParams }: Props) {
  const search = await searchParams;
  const today = todayStr();
  const requestedTab = firstParam(search, "tab");
  const initialTab = (TAB_IDS as readonly string[]).includes(requestedTab) ? requestedTab : "overview";
  const budget = parseBudget(firstParam(search, "budget"));
  const filters = chapterFilters(search);
  const chapterParam = Number(firstParam(search, "chapter"));
  const selectedId = Number.isInteger(chapterParam) && chapterParam > 0 ? chapterParam : null;

  const chapterRows = loadChapters();
  const chapterOptions: ChapterOption[] = chapterRows.map((row) => ({
    id: row.id,
    label: `${row.name} (${row.subject})`,
  }));
  const overrides = loadActiveOverrides(today);
  const plan = recommendRevisions({
    chapters: chapterRows,
    prereqs: loadPrereqEdges(),
    revisions: loadPlannerRevisions(),
    mistakes: loadRecentMistakes(today),
    exams: loadUpcomingExams(today),
    overrides,
    today,
    availableMinutes: budget,
  });
  const lectures = lectureProgress();

  const tabs: StudyTab[] = [
    { id: "overview", label: "Overview", content: (<><QvSummary /><OverviewTab budget={budget} /></>) },
    { id: "plan", label: "Plan", content: <PlanTab /> },
    { id: "vault", label: "Vault", content: <VaultTab search={search} /> },
    { id: "review", label: "Revise", content: <ReviewTab /> },
    { id: "notebook", label: "Notebook", content: <NotebookTab /> },
    {
      id: "chapters",
      label: "Chapters",
      content: (<><ChapterQuestionPanel /><ChaptersTab filters={filters} selectedId={selectedId} /></>),
    },
    { id: "analytics", label: "Analytics", content: <AnalyticsTab /> },
    {
      id: "revision",
      label: "Chapter plan",
      content: (
        <RevisionPlanner
          plan={plan}
          overrides={overrides}
          budget={budget}
          logChoices={chapterOptions.map((option) => ({ id: option.id, label: option.label }))}
          today={today}
        />
      ),
    },
    { id: "mocks", label: "Mocks", content: <MocksTab /> },
    { id: "questions", label: "Question log", content: <QuestionsTab chapters={chapterOptions} /> },
    { id: "practice", label: "Sessions", content: <PracticeTab /> },
    { id: "exams", label: "Exams", content: <ExamsTab /> },
    { id: "mistakes", label: "Mistake log", content: <MistakesTab /> },
    { id: "lectures", label: "Lectures", content: <LecturesTab /> },
    { id: "resources", label: "Resources", content: <ResourcesTab chapters={chapterOptions} /> },
    { id: "settings", label: "Settings", content: <SettingsTab /> },
  ];

  return (
    <Page
      kicker="Study HQ"
      title="Study HQ"
      lede={`Boards and JEE, tracked by what you can actually solve. ${lectures.count} lectures logged, ${Math.round(lectures.watched)} of ${Math.round(lectures.duration)} min watched.`}
    >
      <StudyTabs tabs={tabs} initialTab={initialTab} label="Study sections" />
    </Page>
  );
}
