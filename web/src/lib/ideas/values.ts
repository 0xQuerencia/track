import type { IdeaDetail } from "./queries";

/** The editable text and select fields of an idea, as the form holds them. */
export type IdeaFormValues = {
  title: string;
  body: string;
  category: string;
  status: string;
  priority: string;
  tags: string;
  research_links: string;
  attachments: string;
  notes: string;
};

export function ideaFormValues(idea: IdeaDetail): IdeaFormValues {
  return {
    title: idea.title,
    body: idea.body ?? "",
    category: idea.category,
    status: idea.status,
    priority: idea.priority,
    tags: idea.tags ?? "",
    research_links: idea.research_links ?? "",
    attachments: idea.attachments ?? "",
    notes: idea.notes ?? "",
  };
}
