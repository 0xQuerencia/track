/*
 * Starts the Study job ticker inside the server process. The jobs are idempotent and
 * recorded in the database, so this ticker, an external timer calling /api/study/jobs,
 * and a restart after downtime all converge on the same result. Set TRACK_JOBS=off to
 * run only from an external timer.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.TRACK_JOBS === "off") return;
  const g = globalThis as { __qvTicker?: ReturnType<typeof setInterval> };
  if (g.__qvTicker) return;
  const { runDueJobs } = await import("./lib/qv/jobs");
  const tick = () => {
    try {
      runDueJobs();
    } catch (error) {
      console.error("[study-jobs] tick failed:", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(tick, 15_000);
  g.__qvTicker = setInterval(tick, 60_000);
  g.__qvTicker.unref?.();
}
