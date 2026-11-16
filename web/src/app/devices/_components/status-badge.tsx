/** A status label. The text is the honest state: Unknown unless evidence exists, and the detail says why. */
export function StatusBadge({
  state,
  label,
  detail,
}: {
  state: "Online" | "Offline" | "Up" | "Down" | "Unknown";
  label: string;
  detail?: string;
}) {
  return (
    <span className="dev-status" data-state={state}>
      <span className="dev-dot" aria-hidden="true" />
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}
