import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmActionButton } from "@/components/track/confirm-action";
import { Markdown } from "@/components/track/markdown";
import { Page, Panel, SplitPanels } from "@/components/track/page";
import { RelatedLinks } from "@/components/track/related-links";
import { shortDay, todayStr, addDays } from "@/lib/dates";
import { listLinks } from "@/lib/links";
import { getUpcomingImportantDates } from "@/lib/people";
import {
  getPerson,
  listImportantDates,
  personOptions,
} from "@/lib/people/queries";
import {
  createImportantDateAction,
  deletePersonAction,
  updatePersonAction,
} from "../actions";
import { ImportantDateForm } from "../_components/date-form";
import { PersonForm } from "../_components/person-form";
import { DateEditors, TagList } from "../_components/people-views";
import "@/styles/people.css";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const person = getPerson(id);
  if (!person) notFound();

  const today = todayStr();
  const upcoming = getUpcomingImportantDates(today, addDays(today, 365)).filter(
    (item) => item.personId === id,
  );
  const dates = listImportantDates(id);
  const options = personOptions();

  return (
    <Page kicker="Person" title={person.name} lede={person.relationship ?? undefined}>
      <p className="people-back">
        <Link href="/people">← All people</Link>
      </p>

      <section className="tk-panel people-summary" aria-label="Summary">
        <dl className="people-facts">
          <div>
            <dt>Birthday</dt>
            <dd>{person.birthday ?? "—"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{person.phone ?? "—"}</dd>
          </div>
          <div>
            <dt>Last contacted</dt>
            <dd>{person.last_contacted ? shortDay(person.last_contacted) : "—"}</dd>
          </div>
          <div>
            <dt>Tags</dt>
            <dd>
              <TagList tags={person.tags} />
            </dd>
          </div>
        </dl>
        <div className="people-notes">
          {person.notes ? <Markdown source={person.notes} /> : <p className="tk-empty-small">No notes.</p>}
        </div>
        <h3 className="people-subhead">Coming up in the next year</h3>
        {upcoming.length === 0 ? (
          <p className="tk-empty-small">No dates for this person in the next year.</p>
        ) : (
          <ol className="people-upcoming">
            {upcoming.map((item) => (
              <li key={`${item.source}-${item.id}-${item.date}`}>
                <time dateTime={item.date}>{shortDay(item.date)}</time>
                <span>{item.title}</span>
                <small>{item.kind}</small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <SplitPanels>
        <Panel title="Edit" description="Only the details you choose to keep are stored.">
          <PersonForm
            action={updatePersonAction.bind(null, person.id)}
            submitLabel="Save person"
            defaults={{
              name: person.name,
              relationship: person.relationship,
              phone: person.phone,
              birthday: person.birthday,
              last_contacted: person.last_contacted,
              tags: person.tags,
              notes: person.notes,
            }}
          />
          <div className="people-danger">
            <ConfirmActionButton label={person.name} action={deletePersonAction.bind(null, person.id)} />
            <p className="people-muted">Deleting removes this person. Their dates stay, without a person.</p>
          </div>
        </Panel>
        <Panel title="Dates" description="Dates linked to this person.">
          <details className="tk-add" open={dates.length === 0}>
            <summary>Add a date for {person.name}</summary>
            <ImportantDateForm
              action={createImportantDateAction}
              people={options}
              defaults={{ person_id: person.id }}
              submitLabel="Add date"
              resetOnSuccess
            />
          </details>
          {dates.length === 0 ? (
            <p className="tk-empty">No dates linked to this person.</p>
          ) : (
            <DateEditors rows={dates} people={options} />
          )}
        </Panel>
      </SplitPanels>

      <RelatedLinks
        type="people"
        id={person.id}
        links={listLinks("people", person.id)}
        title="Related records"
      />
    </Page>
  );
}
