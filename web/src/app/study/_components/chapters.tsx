import Link from "next/link";
import { EntityPanel } from "@/components/track/entity-panel";
import { listRows } from "@/lib/crud";
import { PRIORITIES, STUDY_SUBJECTS, TRACKS } from "@/lib/study/options";
import { loadChapters, loadPrereqEdges, type ChapterRow } from "@/lib/study/queries";
import type { ChapterFilters } from "./params";
import { studyHref } from "./params";
import { ChapterDetail } from "./chapter-detail";

/** Prerequisite warnings: a chapter whose prerequisite has lower mastery than it does. */
function prereqWarnings(chapters: ChapterRow[]): Map<number, { count: number; weaker: number }> {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const result = new Map<number, { count: number; weaker: number }>();
  for (const edge of loadPrereqEdges()) {
    const chapter = byId.get(edge.chapter_id);
    const prereq = byId.get(edge.prereq_id);
    if (!chapter || !prereq) continue;
    const entry = result.get(chapter.id) ?? { count: 0, weaker: 0 };
    const weaker =
      (prereq.mastery ?? 0) < (chapter.mastery ?? 0) || prereq.done !== 1;
    result.set(chapter.id, {
      count: entry.count + 1,
      weaker: entry.weaker + (weaker ? 1 : 0),
    });
  }
  return result;
}

function FilterBar({ filters }: { filters: ChapterFilters }) {
  return (
    <form method="get" action="/study" className="st-filters" aria-label="Filter chapters">
      <input type="hidden" name="tab" value="chapters" />
      <label className="tk-field">
        <span>Subject</span>
        <select name="subject" defaultValue={filters.subject}>
          <option value="">All subjects</option>
          {STUDY_SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Track</span>
        <select name="track" defaultValue={filters.track}>
          <option value="">All tracks</option>
          {TRACKS.map((track) => (
            <option key={track} value={track}>
              {track}
            </option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Priority</span>
        <select name="priority" defaultValue={filters.priority}>
          <option value="">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Covered</span>
        <select name="covered" defaultValue={filters.covered}>
          <option value="">Any</option>
          <option value="yes">Covered</option>
          <option value="no">Not covered</option>
        </select>
      </label>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button">
          Apply filters
        </button>
      </div>
    </form>
  );
}

/** The Chapters tab: filtered syllabus table with inline edits, plus the selected chapter's detail. */
export function ChaptersTab({
  filters,
  selectedId,
}: {
  filters: ChapterFilters;
  selectedId: number | null;
}) {
  const chapters = loadChapters();
  const warnings = prereqWarnings(chapters);
  const rows = listRows("chapters").filter((row) => {
    if (filters.subject && row.subject !== filters.subject) return false;
    if (filters.track && row.track !== filters.track) return false;
    if (filters.priority && row.priority !== filters.priority) return false;
    if (filters.covered === "yes" && row.done !== 1) return false;
    if (filters.covered === "no" && row.done === 1) return false;
    return true;
  });
  const selected = selectedId !== null ? chapters.find((chapter) => chapter.id === selectedId) : undefined;

  return (
    <>
      <FilterBar filters={filters} />
      <EntityPanel
        entityKey="chapters"
        title="Chapters"
        description="Covered means taught or read; mastery is how well you can actually solve it. The Class 12 PCM list is a starter: check it against the official CBSE syllabus and edit freely. A warning means a prerequisite has lower mastery than the chapter."
        rows={rows}
        limit={120}
        columns={[
          { name: "subject" },
          { name: "klass" },
          { name: "name" },
          { name: "track" },
          { name: "priority", inline: true },
          { name: "done", inline: true },
          { name: "mastery", inline: true },
          { name: "weight", inline: true },
          { name: "est_minutes", label: "Est. min", inline: true },
          { name: "last_revised_at", label: "Last revised" },
          {
            name: "prereqs",
            label: "Prerequisites",
            render: (row) => {
              const warning = warnings.get(Number(row.id));
              if (!warning) return "—";
              return (
                <span>
                  {warning.count}
                  {warning.weaker > 0 ? (
                    <strong className="st-warn" title="A prerequisite has lower mastery or is not covered">
                      {" "}Warning: {warning.weaker} weaker
                    </strong>
                  ) : null}
                </span>
              );
            },
          },
          {
            name: "open",
            label: "Detail",
            render: (row) => (
              <Link href={studyHref({ tab: "chapters", chapter: Number(row.id), filters, hash: "chapter-detail" })}>
                Open<span className="tk-sr-only"> {String(row.name)}</span>
              </Link>
            ),
          },
        ]}
      />
      {selectedId !== null && !selected ? (
        <p className="tk-empty">That chapter was not found. It may have been removed.</p>
      ) : null}
      {selected ? (
        <ChapterDetail chapter={selected} chapters={chapters} filters={filters} />
      ) : null}
    </>
  );
}
