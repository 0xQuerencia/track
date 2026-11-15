import Link from "next/link";
import { EntityPanel } from "@/components/track/entity-panel";
import { InlineField } from "@/components/track/row-controls";
import { listRows, type Row } from "@/lib/crud";
import { getEntity } from "@/lib/entities";
import { shortDay } from "@/lib/dates";
import { RecordPanel, type RecordColumn } from "./record-panel";
import type { ChapterOption } from "./record-form";

const percent = (watched: number, duration: number): number =>
  duration > 0 ? Math.min(100, Math.round((watched / duration) * 100)) : 0;

/** Lectures (planned dates added) and assignments with deadlines. */
export function LecturesTab() {
  const assignmentEntity = getEntity("assignments");
  const statusField = assignmentEntity?.fields.find((field) => field.name === "status");
  const assignmentColumns: RecordColumn[] = [
    { label: "Assignment", render: (row) => String(row.title) },
    { label: "Subject", render: (row) => String(row.subject ?? "—") },
    {
      label: "Due",
      render: (row) => (row.due_date ? shortDay(String(row.due_date)) : "—"),
    },
    {
      label: "Status",
      render: (row) =>
        statusField ? (
          <InlineField
            entityKey="assignments"
            id={Number(row.id)}
            field={statusField}
            value={row.status === null ? null : String(row.status)}
          />
        ) : (
          String(row.status ?? "—")
        ),
    },
    { label: "Notes", render: (row: Row) => String(row.notes ?? "—") },
  ];
  return (
    <>
      <EntityPanel
        entityKey="lectures"
        title="Lectures"
        description="Watching a lecture does not count as mastery. Solve questions afterwards and record them under Questions. Set a planned date to show it on the Overview for that day."
        rows={listRows("lectures")}
        columns={[
          { name: "title" },
          { name: "course" },
          { name: "subject" },
          { name: "planned_date", label: "Planned for" },
          { name: "watched_min", inline: true },
          { name: "duration_min" },
          {
            name: "progress",
            label: "Watched",
            render: (row) => {
              const pct = percent(Number(row.watched_min ?? 0), Number(row.duration_min ?? 0));
              return <progress max={100} value={pct} aria-label={`${pct}% watched`} title={`${pct}%`} />;
            },
          },
          { name: "speed" },
          { name: "url" },
        ]}
      />
      <RecordPanel
        entityKey="assignments"
        title="Assignments"
        description="Deadlines show on the Overview from the day they fall due until they are done."
        rows={listRows("assignments")}
        columns={assignmentColumns}
        chapters={[]}
      />
    </>
  );
}

/** Study resources linked to a subject, optionally to a chapter. */
export function ResourcesTab({ chapters }: { chapters: ChapterOption[] }) {
  const names = new Map(chapters.map((chapter) => [chapter.id, chapter.label]));
  const columns: RecordColumn[] = [
    {
      label: "Title",
      render: (row) =>
        row.url ? (
          <Link href={String(row.url)} target="_blank" rel="noreferrer noopener">
            {String(row.title)}
          </Link>
        ) : (
          String(row.title)
        ),
    },
    { label: "Kind", render: (row) => String(row.kind ?? "—") },
    { label: "Subject", render: (row) => String(row.subject ?? "—") },
    {
      label: "Chapter",
      render: (row) =>
        row.chapter_id === null ? "—" : (names.get(Number(row.chapter_id)) ?? "Removed chapter"),
    },
  ];
  return (
    <RecordPanel
      entityKey="study_resources"
      title="Resources"
      description="Books, videos, notes and sites. Link a chapter to find them from its subject."
      rows={listRows("study_resources")}
      columns={columns}
      chapters={chapters}
    />
  );
}
