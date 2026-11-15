import type { ReactNode } from "react";

/** A labelled form control in the house style (tk-field). Wide for long text. */
export function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="tk-field" data-wide={wide || undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function StatusLine({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p className="pj-status" role={state.ok ? "status" : "alert"} data-tone={state.ok ? "ok" : "error"}>
      {state.message}
    </p>
  );
}
