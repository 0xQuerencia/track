"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { addLinkAction, removeLinkAction, type LinkActionState } from "@/app/link-actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { SearchHit } from "@/lib/crud";
import {
  LINK_RELATIONS,
  LINK_RELATION_LABELS,
  type LinkRelation,
  type LinkView,
} from "@/lib/link-types";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export type RelatedLinksProps = {
  /** The record this panel belongs to: its link type and id. */
  type: string;
  id: string | number;
  /** Links for this record, from listLinks() on the server. */
  links: LinkView[];
  /** Optional heading override. */
  title?: string;
};

type Picked = Pick<SearchHit, "entity" | "singular" | "title" | "id">;
type SearchState = { term: string; hits: Picked[]; failed: boolean };

const SEARCH_DELAY_MS = 200;
const MIN_TERM = 2;

/** Groups links by the kind of record they point to, keeping server order. */
function groupByType(links: LinkView[]): [string, LinkView[]][] {
  const groups = new Map<string, LinkView[]>();
  for (const link of links) {
    groups.set(link.typeLabel, [...(groups.get(link.typeLabel) ?? []), link]);
  }
  return [...groups.entries()];
}

function relationText(link: LinkView): string {
  const label = LINK_RELATION_LABELS[link.relation];
  if (link.direction === "out") return label;
  return link.relation === "related" ? "Linked from" : `${label}, from`;
}

export function RelatedLinks({ type, id, links, title = "Related" }: RelatedLinksProps) {
  const router = useRouter();
  const headingId = useId();
  const resultsId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<LinkActionState | null>(null);
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState<LinkRelation>("related");
  const [results, setResults] = useState<SearchState | null>(null);
  const debounced = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);

  useEffect(() => {
    if (debounced.length < MIN_TERM) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: { hits: Picked[] }) =>
        setResults({ term: debounced, hits: data.hits, failed: false }),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setResults({ term: debounced, hits: [], failed: true });
      });
    return () => controller.abort();
  }, [debounced]);

  const current = results?.term === debounced ? results : null;
  const linkedKeys = new Set(links.map((link) => `${link.type}|${link.recordId}`));
  const self = `${type}|${String(id)}`;
  const candidates = (current?.hits ?? []).filter(
    (hit) =>
      !linkedKeys.has(`${hit.entity}|${String(hit.id)}`) &&
      `${hit.entity}|${String(hit.id)}` !== self,
  );
  const searching = debounced.length >= MIN_TERM && current === null;

  const run = (action: () => Promise<LinkActionState>) => {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result.ok) {
        setQuery("");
        router.refresh();
      }
    });
  };

  const groups = groupByType(links);

  return (
    <section className="tk-panel tk-related" aria-labelledby={headingId}>
      <header className="tk-panel-head">
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>Connections to other records, in either direction.</p>
        </div>
        <span className="tk-count">{links.length}</span>
      </header>

      {groups.length === 0 ? (
        <p className="tk-empty">Nothing linked yet.</p>
      ) : (
        groups.map(([label, items]) => (
          <div key={label} className="tk-related-group">
            <h3>{label}</h3>
            <ul className="tk-related-list">
              {items.map((link) => (
                <li key={link.id}>
                  <span className="tk-related-relation">{relationText(link)}</span>
                  {link.href ? (
                    <Link href={link.href}>{link.title}</Link>
                  ) : (
                    <span>{link.title}</span>
                  )}
                  {link.note ? <small>{link.note}</small> : null}
                  <button
                    type="button"
                    className="tk-button tk-ghost tk-danger"
                    disabled={pending}
                    aria-label={`Unlink ${link.title}`}
                    onClick={() => run(() => removeLinkAction(link.id))}
                  >
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <details className="tk-add">
        <summary>Link a record</summary>
        <div className="tk-related-picker">
          <label className="tk-field">
            <span>Find a record</span>
            <input
              type="search"
              value={query}
              placeholder="Search by title"
              maxLength={80}
              aria-controls={resultsId}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="tk-field">
            <span>Relation</span>
            <select
              value={relation}
              onChange={(event) => setRelation(event.target.value as LinkRelation)}
            >
              {LINK_RELATIONS.map((option) => (
                <option key={option} value={option}>
                  {LINK_RELATION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <div id={resultsId} className="tk-related-results" aria-live="polite">
            {searching ? <p className="tk-empty-small">Searching…</p> : null}
            {current?.failed ? (
              <p className="tk-empty-small">Search is unavailable right now.</p>
            ) : null}
            {current && !current.failed && candidates.length === 0 && debounced.length >= MIN_TERM ? (
              <p className="tk-empty-small">No matching records.</p>
            ) : null}
            {candidates.length > 0 ? (
              <ul className="tk-list">
                {candidates.map((hit) => (
                  <li key={`${hit.entity}-${hit.id}`}>
                    <button
                      type="button"
                      className="tk-related-pick"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          addLinkAction(
                            { type, id: String(id) },
                            { type: hit.entity, id: String(hit.id) },
                            relation,
                          ),
                        )
                      }
                    >
                      <span>{hit.title}</span>
                      <small>{hit.singular}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </details>

      {message ? (
        <ActionNotice tone={message.ok ? "info" : "error"} role={message.ok ? "status" : "alert"}>
          {message.message}
        </ActionNotice>
      ) : null}
    </section>
  );
}
