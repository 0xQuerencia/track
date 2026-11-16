"use client";

import { useId, useState } from "react";
import { markdownNodes } from "@/lib/markdown";

/** Read-only Markdown view. Text is escaped by React; see src/lib/markdown.tsx. */
export function Markdown({ source, className = "" }: { source: string | null | undefined; className?: string }) {
  return <div className={`md ${className}`.trim()}>{markdownNodes(source)}</div>;
}

type EditorProps = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  hint?: string;
  disabled?: boolean;
};

/**
 * A textarea with Write and Preview modes. The textarea stays mounted in both
 * modes (hidden in Preview), so a surrounding form still submits its value.
 */
export function MarkdownEditor({
  name,
  label,
  value,
  onChange,
  rows = 12,
  maxLength = 100_000,
  hint,
  disabled = false,
}: EditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const areaId = useId();
  const hintId = useId();
  const previewing = mode === "preview";

  return (
    <div className="md-editor" data-mode={mode}>
      <div className="md-editor-head">
        <label htmlFor={areaId}>{label}</label>
        <div className="md-editor-modes" role="group" aria-label={`${label} mode`}>
          <button
            type="button"
            className="tk-button tk-ghost"
            aria-pressed={!previewing}
            onClick={() => setMode("write")}
          >
            Write
          </button>
          <button
            type="button"
            className="tk-button tk-ghost"
            aria-pressed={previewing}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>
      </div>
      <textarea
        id={areaId}
        name={name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        hidden={previewing}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
      />
      {previewing ? (
        <div className="md-editor-preview" aria-label={`${label} preview`}>
          {value.trim() ? <Markdown source={value} /> : <p className="tk-empty-small">Nothing to preview.</p>}
        </div>
      ) : null}
      {hint ? (
        <p id={hintId} className="md-editor-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
