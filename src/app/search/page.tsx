import Link from "next/link";
import { Page } from "@/components/track/page";
import { searchAll } from "@/lib/crud";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const term = (Array.isArray(q) ? q[0] : q) ?? "";
  const hits = searchAll(term);
  const groups = new Map<string, typeof hits>();
  for (const hit of hits) groups.set(hit.singular, [...(groups.get(hit.singular) ?? []), hit]);

  return (
    <Page
      kicker="Search"
      title={term.trim().length >= 2 ? `Results for “${term.trim()}”` : "Search"}
      lede={
        term.trim().length >= 2
          ? `${hits.length} ${hits.length === 1 ? "match" : "matches"} across every module.`
          : "Type at least two characters in the search box."
      }
    >
      {[...groups.entries()].map(([label, items]) => (
        <section key={label} className="tk-panel" aria-label={label}>
          <header className="tk-panel-head">
            <h2>{label}</h2>
            <span className="tk-count">{items.length}</span>
          </header>
          <ul className="tk-list">
            {items.map((hit) => (
              <li key={`${hit.entity}-${hit.id}`}>
                <Link href={hit.href}>{hit.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
