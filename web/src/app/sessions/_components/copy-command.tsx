"use client";

import { useState } from "react";

/** Copies the resume text to the clipboard. The command is only displayed and copied; nothing runs it. */
export function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="ses-copy">
      <button type="button" className="tk-button" onClick={copy}>
        Copy resume command
      </button>
      <span role="status" aria-live="polite" className="ses-hint">
        {status === "copied" ? "Copied." : status === "failed" ? "Copy was blocked. Select the text and copy it." : ""}
      </span>
    </div>
  );
}
