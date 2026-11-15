const amount = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Used against total storage, from the numbers recorded. Nothing is shown when either is missing. */
export function StorageBar({ total, used }: { total: unknown; used: unknown }) {
  const totalGb = toNumber(total);
  const usedGb = toNumber(used);
  if (totalGb === null || totalGb <= 0 || usedGb === null)
    return <span className="dev-muted">Storage not recorded</span>;
  const percent = Math.round((usedGb / totalGb) * 100);
  const bar = Math.min(100, Math.max(0, percent));
  const over = usedGb > totalGb;
  return (
    <div className="dev-storage" data-over={over || undefined}>
      <progress max={100} value={bar} aria-label={`Storage ${percent}% used`} />
      <small>
        {amount.format(usedGb)} of {amount.format(totalGb)} GB used ({percent}%)
        {over ? " · recorded use is more than the total" : ""}
      </small>
    </div>
  );
}
