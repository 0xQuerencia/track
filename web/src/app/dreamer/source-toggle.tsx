import { setEntryEnabledAction } from "./actions";
import type { DreamerSource } from "@/lib/dreamer/types";

/** Small source-owned control embedded on journal and note detail pages. */
export function DreamerSourceToggle({ source, refId, enabled }: { source: DreamerSource; refId: string; enabled: boolean }) {
  return (
    <form className="dreamer-source-toggle" action={setEntryEnabledAction.bind(null, source, refId, !enabled)}>
      <span>{enabled ? "Included in Dreamer analysis" : "Excluded from Dreamer analysis"}</span>
      <button className="tk-button tk-ghost" type="submit">{enabled ? "Exclude from Dreamer" : "Include in Dreamer"}</button>
    </form>
  );
}
