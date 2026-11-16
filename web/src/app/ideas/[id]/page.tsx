import Link from "next/link";
import { notFound } from "next/navigation";
import { RelatedLinks } from "@/components/track/related-links";
import { Page, Panel } from "@/components/track/page";
import { getIdea } from "@/lib/ideas/queries";
import { ideaFormValues } from "@/lib/ideas/values";
import { projectStatusOptions } from "@/lib/ideas/schema";
import { listLinks } from "@/lib/links";
import { safeHttpUrl, urlLabel } from "@/lib/knowledge/urls";
import { hrefWith } from "@/lib/knowledge/params";
import { shortDay } from "@/lib/dates";
import "@/styles/ideas.css";
import "@/styles/knowledge.css";
import { ConvertPanel } from "../_components/convert-panel";
import { IdeaEditor } from "../_components/idea-editor";
import { IdeaToolbar } from "../_components/idea-toolbar";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^\d{1,9}$/;

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = ID_PATTERN.test(raw) ? Number(raw) : 0;
  const idea = id > 0 ? getIdea(id) : undefined;
  if (!idea) notFound();

  const links = listLinks("ideas", idea.id);
  const researchLinks = (idea.research_links ?? "").split("\n").filter(Boolean);
  const attachments = (idea.attachments ?? "").split("\n").filter(Boolean);
  const excerpt = (idea.body ?? "").replace(/\s+/g, " ").trim().slice(0, 500);

  return (
    <Page
      kicker={`Idea · ${idea.status}`}
      title={idea.title}
      lede={`${idea.category} · ${idea.priority} priority · last edited ${shortDay(idea.updated_at.slice(0, 10))}`}
    >
      <p className="id-back">
        <Link href={hrefWith("/ideas", {})}>← All ideas</Link>
      </p>

      <IdeaToolbar id={idea.id} title={idea.title} pinned={idea.pinned === 1} archived={idea.archived === 1} />

      <div className="id-detail">
        <Panel title="Idea" description="Edit the text and fields. Changes autosave as a local draft until you save.">
          <IdeaEditor key={idea.updated_at} id={idea.id} initial={ideaFormValues(idea)} />
        </Panel>

        <aside className="id-side" aria-label="Research and project">
          <Panel title="Research links">
            {researchLinks.length === 0 ? (
              <p className="tk-empty-small">No research links yet. Add web addresses in the Idea panel.</p>
            ) : (
              <ul className="tk-list id-link-list">
                {researchLinks.map((line) => {
                  const url = safeHttpUrl(line);
                  return (
                    <li key={line}>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                          {urlLabel(url)}
                        </a>
                      ) : (
                        <span>{line}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Attachments" description="References only. Files are not uploaded here.">
            {attachments.length === 0 ? (
              <p className="tk-empty-small">None listed.</p>
            ) : (
              <ul className="tk-list">
                {attachments.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Panel>

          {idea.project_id !== null && idea.project_name !== null ? (
            <Panel title="Project" description="This idea is linked to a project.">
              <p>
                <Link href={`/projects/${idea.project_id}`}>{idea.project_name}</Link>
              </p>
            </Panel>
          ) : (
            <ConvertPanel
              ideaId={idea.id}
              defaultName={idea.title}
              defaultNotes={excerpt}
              statuses={projectStatusOptions()}
            />
          )}
        </aside>
      </div>

      <RelatedLinks type="ideas" id={idea.id} links={links} />
    </Page>
  );
}
