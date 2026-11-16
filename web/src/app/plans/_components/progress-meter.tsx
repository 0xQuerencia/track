import type { GoalProgress } from "@/lib/plans/progress";
import { progressLabel } from "@/lib/plans/progress";

/** Shows finished units out of tracked units. With nothing tracked it says so, with no bar. */
export function ProgressMeter({ progress, label }: { progress: GoalProgress; label?: string }) {
  if (progress.total === 0)
    return (
      <p className="pl-meter pl-meter-empty">
        <span>{progressLabel(progress)}</span>
      </p>
    );
  return (
    <div className="pl-meter">
      <progress
        max={100}
        value={progress.percent ?? 0}
        aria-label={label ?? `Progress: ${progressLabel(progress)}`}
      />
      <span className="pl-meter-text">
        {progressLabel(progress)}
        {progress.percent !== null ? <b className="tk-mono"> · {progress.percent}%</b> : null}
      </span>
    </div>
  );
}
