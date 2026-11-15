/** Measured value against a target, for one period. Shows the number, never a guess. */
export function TargetMeter({
  label,
  percent,
  met,
}: {
  label: string;
  percent: number;
  met: boolean;
}) {
  return (
    <div className="hl-meter">
      <progress max={100} value={Math.min(percent, 100)} aria-label={`${label}: ${percent}% of target`} />
      <span className="hl-muted">
        {percent}% of target{met ? " · met" : ""}
      </span>
    </div>
  );
}
