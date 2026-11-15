import type { ReactNode } from "react";

/* Small server-rendered charts. Every bar carries its number as text, so nothing depends on colour or hover. */

export function StackBar({ parts }: { parts: { label: string; value: number; state: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="st-inline-note">No graded questions yet.</p>;
  return (
    <div>
      <div className="qv-stack" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} data-state={p.state} style={{ flexGrow: p.value }} />)}
      </div>
      <ul className="qv-legend">{parts.map((p) => <li key={p.label}><i data-state={p.state} />{p.label} <b>{p.value}</b></li>)}</ul>
    </div>
  );
}

export function Bars({ data, unit = "", empty = "Nothing to show yet.", height = 96 }: { data: { label: string; value: number | null; note?: string }[]; unit?: string; empty?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  if (!data.some((d) => d.value)) return <p className="st-inline-note">{empty}</p>;
  return (
    <ol className="qv-bars" style={{ height }}>
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${d.value ?? "no data"}${unit}`}>
          <span className="qv-bar-val">{d.value === null ? "–" : `${d.value}${unit}`}</span>
          <span className="qv-bar" style={{ height: `${Math.max(d.value ? 4 : 0, ((d.value ?? 0) / max) * 100)}%` }} />
          <span className="qv-bar-label">{d.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function HBars({ data, unit = "" }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="st-inline-note">Nothing recorded yet.</p>;
  return (
    <ul className="qv-hbars">
      {data.map((d) => (
        <li key={d.label}><span>{d.label}</span><span className="qv-hbar"><i style={{ width: `${(d.value / max) * 100}%` }} /></span><b>{d.value}{unit}</b></li>
      ))}
    </ul>
  );
}

/** Activity grid: one cell per day, shade by count, count in the tooltip and label. */
export function ActivityGrid({ days }: { days: { date: string; attempted: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.attempted));
  return (
    <div className="qv-activity" role="list" aria-label="Questions attempted per day">
      {days.map((d) => (
        <span key={d.date} role="listitem" className="qv-cell" data-level={d.attempted === 0 ? 0 : Math.min(4, Math.ceil((d.attempted / max) * 4))} title={`${d.date}: ${d.attempted} attempted`} aria-label={`${d.date}: ${d.attempted} attempted`} />
      ))}
    </div>
  );
}

export function Meter({ value, label }: { value: number | null; label: ReactNode }) {
  return (
    <div className="qv-meter">
      <span>{label}</span>
      <span className="qv-hbar"><i style={{ width: `${value ?? 0}%` }} /></span>
      <b>{value === null ? "not enough data" : `${value}%`}</b>
    </div>
  );
}
