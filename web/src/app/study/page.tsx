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

export const dynamic = "force-dynamic";

const TAB_IDS = [
  "overview",
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
    { id: "overview", label: "Overview", content: <OverviewTab budget={budget} /> },
    {
      id: "chapters",
      label: "Chapters",
      content: <ChaptersTab filters={filters} selectedId={selectedId} />,
    },
    {
      id: "revision",
      label: "Revision",
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
    { id: "questions", label: "Questions", content: <QuestionsTab chapters={chapterOptions} /> },
    { id: "practice", label: "Practice", content: <PracticeTab /> },
    { id: "exams", label: "Exams", content: <ExamsTab /> },
    { id: "mistakes", label: "Mistakes", content: <MistakesTab /> },
    { id: "lectures", label: "Lectures & assignments", content: <LecturesTab /> },
    { id: "resources", label: "Resources", content: <ResourcesTab chapters={chapterOptions} /> },
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
