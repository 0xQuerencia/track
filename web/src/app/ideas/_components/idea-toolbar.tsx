"use client";

import { deleteIdeaAction } from "../actions";
import { ConfirmButton } from "@/components/track/confirm-button";
import { FlagButton } from "./flag-button";

/** Pin, archive and delete for one idea. Delete is two-step and leads back to the list. */
export function IdeaToolbar({ id, title, pinned, archived }: { id: number; title: string; pinned: boolean; archived: boolean }) {
  return (
    <div className="id-toolbar" role="toolbar" aria-label="Idea actions">
      <FlagButton id={id} flag="pinned" value={pinned} onLabel="Pin" offLabel="Unpin" />
      <FlagButton id={id} flag="archived" value={archived} onLabel="Archive" offLabel="Restore" />
      <ConfirmButton
        label={`Delete idea ${title.slice(0, 40)}`}
        confirmLabel="Confirm delete"
        onConfirm={() => deleteIdeaAction(id)}
      />
    </div>
  );
}
