import Link from "next/link";
import { Page, Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { DOCUMENT_CATEGORIES, EXPIRY_ATTENTION_DAYS } from "@/lib/documents/constants";
import { documentStats, DOCUMENT_PAGE_SIZE, listDocuments } from "@/lib/documents/queries";
import { getExpiringDocuments } from "@/lib/documents";
import { shortDay, todayStr } from "@/lib/dates";
import { createDocumentAction } from "./actions";
import { DocumentTable } from "./_components/document-views";
import { DocumentForm } from "./_components/document-form";
import "@/styles/documents.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const EXPIRY_FILTERS = ["all", "attention", "expired"] as const;
type ExpiryFilter = (typeof EXPIRY_FILTERS)[number];
const EXPIRY_LABELS: Record<ExpiryFilter, string> = {
  all: "Any expiry",
  attention: `Expiring within ${EXPIRY_ATTENTION_DAYS} days, or expired`,
  expired: "Expired",
};

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const q = first(raw.q).trim().slice(0, 80);
  const categoryRaw = first(raw.category);
  const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : "";
  const expiryRaw = first(raw.expiry);
  const expiry: ExpiryFilter = (EXPIRY_FILTERS as readonly string[]).includes(expiryRaw)
    ? (expiryRaw as ExpiryFilter)
    : "all";
  const pageNumber = Number.parseInt(first(raw.page), 10);
  const today = todayStr();

  const stats = documentStats(today);
  const list = listDocuments({ q, category, expiry }, Number.isFinite(pageNumber) ? pageNumber : 1, today);
  const attention = getExpiringDocuments(EXPIRY_ATTENTION_DAYS);

  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (expiry !== "all") query.set("expiry", expiry);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `/documents?${text}` : "/documents";
  };

  return (
    <Page
      kicker="Documents"
      title="Documents"
      lede="A private vault for the papers you need to find later. Files are stored on this server and downloaded only by you."
    >
      <StatGrid>
        <StatCard label="Documents" value={stats.total} />
        <StatCard label="With a file" value={stats.withFile} />
        <StatCard
          label="Need attention"
          value={stats.attention}
          tone={stats.attention > 0 ? "negative" : undefined}
          hint={`Expired or within ${EXPIRY_ATTENTION_DAYS} days`}
        />
        <StatCard label="Expired" value={stats.expired} tone={stats.expired > 0 ? "negative" : undefined} />
      </StatGrid>

      {attention.length > 0 ? (
        <section className="tk-panel docs-attention" aria-label="Expiring documents">
          <header className="tk-panel-head">
            <div>
              <h2>Expiring and expired</h2>
              <p>Renew these or update their expiry date.</p>
            </div>
            <span className="tk-count">{attention.length}</span>
          </header>
          <ul className="docs-attention-list">
            {attention.map((item) => (
              <li key={item.id}>
                <Link href={item.href}>{item.title}</Link>
                <time dateTime={item.expiresOn}>{shortDay(item.expiresOn)}</time>
                <span className="docs-badge" data-tone={item.expired ? "expired" : "soon"}>
                  {item.expired ? "Expired" : `${item.daysLeft} days left`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="tk-panel" aria-label="Documents">
        <header className="tk-panel-head">
          <div>
            <h2>Vault</h2>
            <p>Search titles, tags, notes and file names.</p>
          </div>
          <span className="tk-count">{list.total}</span>
        </header>
        <form method="get" action="/documents" className="docs-filters" role="search">
          <label className="docs-field">
            <span>Search</span>
            <input type="search" name="q" maxLength={80} defaultValue={q} />
          </label>
          <label className="docs-field">
            <span>Category</span>
            <select name="category" defaultValue={category}>
              <option value="">All categories</option>
              {DOCUMENT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="docs-field">
            <span>Expiry</span>
            <select name="expiry" defaultValue={expiry}>
              {EXPIRY_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {EXPIRY_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="tk-button tk-ghost">
            Apply
          </button>
        </form>
        {list.rows.length === 0 ? (
          <p className="tk-empty">
            {q || category || expiry !== "all" ? "No documents match these filters." : "No documents yet."}
          </p>
        ) : (
          <DocumentTable rows={list.rows} today={today} />
        )}
        {list.pageCount > 1 ? (
          <nav className="docs-pager" aria-label="Pages">
            {list.page > 1 ? <Link href={pageHref(list.page - 1)}>Previous</Link> : <span />}
            <span className="docs-muted">
              Page {list.page} of {list.pageCount} · {DOCUMENT_PAGE_SIZE} per page
            </span>
            {list.page < list.pageCount ? <Link href={pageHref(list.page + 1)}>Next</Link> : <span />}
          </nav>
        ) : null}
      </section>

      <Panel title="Add a document" description="The file is optional. Add details now and attach a file later if you prefer.">
        <DocumentForm action={createDocumentAction} withFile submitLabel="Add document" />
      </Panel>
    </Page>
  );
}
