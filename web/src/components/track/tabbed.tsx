"use client";

import { useState, type ReactNode } from "react";
import { TabBar } from "@/components/motion/tab-bar";

export type TabSpec = {
  id: string;
  label: string;
  badge?: string;
  content: ReactNode;
};

/** Page sections behind Anime.js-driven tabs. Every panel stays mounted so charts keep their state. */
export function TabbedSections({
  tabs,
  label,
}: {
  tabs: TabSpec[];
  label: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return (
    <div className="tk-tabs">
      <TabBar
        tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: t.badge }))}
        value={active}
        onChange={setActive}
        label={label}
      />
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          aria-label={tab.label}
          hidden={tab.id !== active}
          className="tk-tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
