import Link from "next/link";
import { Page } from "@/components/track/page";
import { searchAll } from "@/lib/crud";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {getDb} from "@/lib/db";
import {searchRecall} from "@/lib/recall";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!await verifySessionToken(token))redirect("/login");
  const { q } = await searchParams;
  const term = (Array.isArray(q) ? q[0] : q) ?? "";
  const hits = searchAll(term);
  // Request-time owner-only search, no provider call or persistent index.
  // eslint-disable-next-line react-hooks/purity
  const recall=searchRecall(getDb(),term,Date.now(),process.env.TRACK_TZ??"UTC");
  const groups = new Map<string, typeof hits>();
  for (const hit of hits) groups.set(hit.singular, [...(groups.get(hit.singular) ?? []), hit]);

  return (
    <Page
      kicker="Search"
      title={term.trim().length >= 2 ? `Results for “${term.trim()}”` : "Search"}
      lede={
        term.trim().length >= 2
          ? `${hits.length+recall.length} matches across local records and Recall.`
          : "Type at least two characters in the search box."
      }
    >
      {recall.length?<section className="tk-panel" aria-label="Recall"><header className="tk-panel-head"><h2>Recall · activity and Dreamer</h2><span className="tk-count">{recall.length}</span></header><ul className="tk-list">{recall.map(hit=><li key={hit.id}><div><Link href={hit.href}>{hit.title}</Link><small>{hit.kind} · {hit.detail}</small></div></li>)}</ul></section>:null}
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
