/** Offers a recovered draft back. Shown above an editor only when the draft differs from the saved text. */
export function DraftNotice({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const when = new Date(savedAt);
  const label = Number.isNaN(when.getTime()) ? "earlier" : when.toLocaleString();
  return (
    <div className="tk-draft-notice" role="status">
      <p>You have an unsaved draft from {label}.</p>
      <div className="tk-draft-actions">
        <button type="button" className="tk-button tk-primary" onClick={onRestore}>
          Restore draft
        </button>
        <button type="button" className="tk-button tk-ghost" onClick={onDiscard}>
          Discard draft
        </button>
      </div>
    </div>
  );
}
