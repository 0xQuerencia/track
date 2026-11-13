import type { ReactNode } from "react";
import { Rise } from "./rise";

/** Standard module page: heading, then blocks that rise into view in order. */
export function Page({
  kicker,
  title,
  lede,
  children,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <main className="tk-page" id="main">
      <header className="tk-page-head">
        {kicker ? <p className="tk-kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {lede ? <p className="tk-lede">{lede}</p> : null}
      </header>
      <Rise className="tk-stack">{children}</Rise>
    </main>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="tk-stat-grid">{children}</div>;
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="tk-panel" aria-label={title}>
      <header className="tk-panel-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function SplitPanels({ children }: { children: ReactNode }) {
  return <div className="tk-split">{children}</div>;
}
