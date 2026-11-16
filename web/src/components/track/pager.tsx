import Link from "next/link";

/** Previous / next links for a server-paged list. Rendered only by server components. */
export function Pager({
  page,
  totalPages,
  buildHref,
  label = "Results pages",
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  label?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="tk-pager" aria-label={label}>
      {page > 1 ? (
        <Link href={buildHref(page - 1)} rel="prev">
          Newer
        </Link>
      ) : (
        <span aria-disabled="true" className="tk-pager-off">Newer</span>
      )}
      <span className="tk-pager-status">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={buildHref(page + 1)} rel="next">
          Older
        </Link>
      ) : (
        <span aria-disabled="true" className="tk-pager-off">Older</span>
      )}
    </nav>
  );
}
