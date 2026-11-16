import Link from "next/link";
import { RelatedLinks } from "@/components/track/related-links";
import { Panel } from "@/components/track/page";
import { todayStr, shortDay } from "@/lib/dates";
import { listLinks } from "@/lib/links";
import { wouldCreateCycle, type PrereqEdge } from "@/lib/study/prereqs";
import {
  loadChapterMistakes,
  loadChapterRevisions,
  loadPrereqEdges,
  loadPrereqLinks,
  type ChapterRow,
} from "@/lib/study/queries";
import { deleteRevisionAction, removePrereqAction } from "../actions";
import { NotesForm } from "./notes-form";
import { PrereqForm } from "./prereq-editor";
import { RemoveButton } from "./remove-button";
import { RevisionLogForm } from "./revision-log-form";
import { studyHref, type ChapterFilters } from "./params";

const percent = (value: number | null): string => (value === null ? "—" : `${value}%`);

/** Detail for one chapter: prerequisites, revision log, linked mistakes, notes and linked records. */
export function ChapterDetail({
  chapter,
  chapters,
  filters,
}: {
  chapter: ChapterRow;
  chapters: ChapterRow[];
  filters: ChapterFilters;
}) {
  const today = todayStr();
  const edges: PrereqEdge[] = loadPrereqEdges();
  const byId = new Map(chapters.map((row) => [row.id, row]));
  const links = loadPrereqLinks(chapter.id);
  const prereqIds = new Set(links.map((link) => link.prereq_id));
  const dependents = edges.filter((edge) => edge.prereq_id === chapter.id);
  const choices = chapters
    .filter(
      (row) =>
        row.id !== chapter.id &&
        !prereqIds.has(row.id) &&
        !wouldCreateCycle(edges, chapter.id, row.id),
    )
    .map((row) => ({ id: row.id, label: `${row.name} (${row.subject})` }));
  const revisions = loadChapterRevisions(chapter.id);
  const mistakes = loadChapterMistakes(chapter.name, chapter.subject);
  const relatedLinks = listLinks("chapters", chapter.id);
  const logChoices = chapters.map((row) => ({ id: row.id, label: `${row.name} (${row.subject})` }));

  return (
    <section id="chapter-detail" className="st-detail" aria-label={`Detail: ${chapter.name}`}>
      <header className="st-detail-head">
        <div>
          <p className="tk-kicker">
            {chapter.subject} · Class {chapter.klass ?? "—"} · {chapter.track}
          </p>
          <h2>{chapter.name}</h2>
        </div>
        <Link className="tk-button tk-ghost" href={studyHref({ tab: "chapters", filters })}>
          Close detail
        </Link>
      </header>

      <dl className="st-facts">
        <div>
          <dt>Mastery</dt>
          <dd>{percent(chapter.mastery)}</dd>
        </div>
        <div>
          <dt>Covered</dt>
          <dd>{chapter.done === 1 ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Exam weight</dt>
          <dd>{chapter.weight} / 5</dd>
        </div>
        <div>
          <dt>Est. minutes</dt>
          <dd>{chapter.est_minutes}</dd>
        </div>
        <div>
          <dt>Revisions</dt>
          <dd>{chapter.revision_count}</dd>
        </div>
        <div>
          <dt>Last revised</dt>
          <dd>{chapter.last_revised_at ? shortDay(chapter.last_revised_at) : "Never"}</dd>
        </div>
      </dl>

      <div className="st-detail-grid">
        <Panel title="Prerequisites" description="Chapters that should be solid before this one.">
          {links.length === 0 ? (
            <p className="tk-empty-small">No prerequisites linked.</p>
          ) : (
            <ul className="tk-list">
              {links.map((link) => {
                const prereq = byId.get(link.prereq_id);
                const weaker =
                  prereq !== undefined &&
                  (prereq.done !== 1 || (prereq.mastery ?? 0) < (chapter.mastery ?? 0));
                return (
                  <li key={link.id}>
                    <span>
                      {prereq?.name ?? "Removed chapter"}
                      {prereq ? (
                        <small>
                          {" "}· mastery {percent(prereq.mastery)}
                          {prereq.done !== 1 ? ", not covered" : ""}
                        </small>
                      ) : null}
                      {weaker ? (
                        <strong className="st-warn"> Warning: lower than this chapter</strong>
                      ) : null}
                    </span>
                    <RemoveButton
                      id={link.id}
                      label={prereq?.name ?? "prerequisite"}
                      remove={removePrereqAction}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {dependents.length > 0 ? (
            <p className="tk-more">
              Needed by: {dependents.map((edge) => byId.get(edge.chapter_id)?.name ?? "removed chapter").join(", ")}
            </p>
          ) : null}
          <PrereqForm chapterId={chapter.id} choices={choices} />
        </Panel>

        <Panel title="Revision log" description="Each revision adds to the count and sets the last-revised date.">
          <RevisionLogForm chapters={logChoices} fixedChapterId={chapter.id} today={today} />
          {revisions.length === 0 ? (
            <p className="tk-empty-small">Not revised yet.</p>
          ) : (
            <div className="tk-table-wrap">
              <table className="tk-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Minutes</th>
                    <th scope="col">Confidence</th>
                    <th scope="col">Notes</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((row) => (
                    <tr key={row.id}>
                      <td>{shortDay(row.date)}</td>
                      <td>{row.minutes ?? "—"}</td>
                      <td>{row.confidence ? `${row.confidence}/5` : "—"}</td>
                      <td>{row.notes ?? "—"}</td>
                      <td data-align="end">
                        <RemoveButton
                          id={row.id}
                          label={`revision on ${row.date}`}
                          remove={deleteRevisionAction}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Linked mistakes" description="Mistakes that name this chapter, unfixed first.">
          {mistakes.length === 0 ? (
            <p className="tk-empty-small">No mistakes name this chapter.</p>
          ) : (
            <ul className="tk-list">
              {mistakes.map((row) => (
                <li key={row.id}>
                  <Link href={studyHref({ tab: "mistakes", hash: `mistakes-${row.id}` })}>{row.note}</Link>
                  <small>
                    {shortDay(row.date)} · {row.fixed === 1 ? "Fixed" : "Open"}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Notes">
        <NotesForm chapterId={chapter.id} notes={chapter.notes} />
      </Panel>

      <RelatedLinks type="chapters" id={chapter.id} links={relatedLinks} title="Linked goals and records" />
    </section>
  );
}
