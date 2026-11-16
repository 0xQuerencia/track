"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TabBar } from "@/components/motion/tab-bar";

export type StudyTab = { id: string; label: string; content: ReactNode };

/** Which tab renders each record type, so search deep links (#key-id) open the right tab. */
const TAB_FOR_ENTITY: Readonly<Record<string, string>> = {
  chapters: "chapters",
  mock_tests: "mocks",
  question_stats: "questions",
  study_sessions: "practice",
  exams: "exams",
  mistakes: "mistakes",
  lectures: "lectures",
  assignments: "lectures",
  study_resources: "resources",
};

const HASH_PATTERN = /^#([a-z_]+)-\d+$/;

/**
 * Tabs for Study HQ. Every panel stays mounted (hidden when inactive) so
 * charts keep their state. The initial tab comes from the URL.
 */
export function StudyTabs({
  tabs,
  initialTab,
  label,
}: {
  tabs: StudyTab[];
  initialTab: string;
  label: string;
}) {
  const [active, setActive] = useState(initialTab);

  // A search result links to #<record type>-<id>. Open the tab that holds it, then scroll to it.
  useEffect(() => {
    const match = HASH_PATTERN.exec(window.location.hash);
    const tab = match ? TAB_FOR_ENTITY[match[1] ?? ""] : undefined;
    if (!tab) return;
    const timer = window.setTimeout(() => {
      setActive(tab);
      window.setTimeout(() => {
        document
          .getElementById(window.location.hash.slice(1))
          ?.scrollIntoView({ block: "center" });
      }, 60);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const current = tabs.some((tab) => tab.id === active) ? active : (tabs[0]?.id ?? "");
  return (
    <div className="tk-tabs st-tabs">
      <TabBar
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        value={current}
        onChange={setActive}
        label={label}
      />
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          aria-label={tab.label}
          hidden={tab.id !== current}
          className="tk-tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
