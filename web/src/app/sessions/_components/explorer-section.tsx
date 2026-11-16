import { PAGE_SIZE } from "@/lib/sessions/constants";
import type { SessionFilters } from "@/lib/sessions/filters";
import type { GroupPage, SessionListRow } from "@/lib/sessions/queries";
import { FilterBar, GroupList, Pager, SessionTable, type ProjectFilterOption } from "./explorer";
import { Panel } from "@/components/track/page";

/** The explorer: filters, then either the chronological page or the grouped page. */
export function Explorer({
  filters,
  projects,
  total,
  rows,
  groups,
}: {
  filters: SessionFilters;
  projects: ProjectFilterOption[];
  total: number;
  rows: SessionListRow[];
  groups: GroupPage | null;
}) {
  const grouped = groups !== null;
  return (
    <Panel title="Explorer" description={`${total} matching session${total === 1 ? "" : "s"}. Lists are paged, ${PAGE_SIZE} per page.`}>
      <FilterBar filters={filters} projects={projects} />
      {total === 0 ? (
        <p className="tk-empty">No sessions match these filters.</p>
      ) : grouped ? (
        <>
          <GroupList page={groups} filters={filters} />
          <Pager filters={filters} total={groups.totalGroups} pageSize={50} />
        </>
      ) : (
        <>
          <SessionTable rows={rows} />
          <Pager filters={filters} total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </Panel>
  );
}
