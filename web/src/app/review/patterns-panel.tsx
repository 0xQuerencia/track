import Link from "next/link";
import { Panel } from "@/components/track/page";
import { getDb } from "@/lib/db";
import { findPatterns, KIND_LABEL, type Pattern, type PatternKind } from "@/lib/patterns";
import { today as qvToday } from "@/lib/qv/store";

const ORDER: PatternKind[] = ["priority", "repeated", "workflow", "skill"];

export function PatternRows({ patterns }: { patterns: Pattern[] }) {
  return (
    <ul className="tk-list">
      {patterns.map((p) => (
        <li key={p.id}>
          <span>
            <Link href={p.href}>{p.title}</Link>
            <small> {p.suggestion} {p.evidence.join(" ")}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Patterns found in your own records. Each line says what was counted; with too little data a section stays empty. */
export function PatternsPanel() {
  const db = getDb();
  const found = findPatterns(db, qvToday(db));
  return (
    <Panel title="Patterns" description="Repeated tasks, skills to build, workflow snags and priorities you may have overlooked. Counted from your records, not guessed.">
      {found.length === 0 ? (
        <p className="tk-empty">No patterns yet. They appear once there are enough tasks, habits, goals or graded questions to compare.</p>
      ) : (
        ORDER.map((kind) => {
          const list = found.filter((p) => p.kind === kind).slice(0, 5);
          return list.length ? (
            <div key={kind}>
              <h3 className="st-subhead">{KIND_LABEL[kind]}</h3>
              <PatternRows patterns={list} />
            </div>
          ) : null;
        })
      )}
    </Panel>
  );
}
