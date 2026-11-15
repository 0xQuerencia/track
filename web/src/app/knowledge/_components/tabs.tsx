import Link from "next/link";
import { hrefWith } from "@/lib/knowledge/params";

export const KNOWLEDGE_TABS = ["notes", "bookmarks", "collections"] as const;
export type KnowledgeTab = (typeof KNOWLEDGE_TABS)[number];

const LABELS: Record<KnowledgeTab, string> = { notes: "Notes", bookmarks: "Bookmarks", collections: "Collections" };

/** Tabs are plain links so the active tab lives in the URL and works without script. */
export function KnowledgeTabs({ active, counts }: { active: KnowledgeTab; counts: Record<KnowledgeTab, number> }) {
  return (
    <nav className="kn-tabs" aria-label="Knowledge sections">
      {KNOWLEDGE_TABS.map((tab) => (
        <Link
          key={tab}
          href={hrefWith("/knowledge", { tab })}
          aria-current={tab === active ? "page" : undefined}
          className="kn-tab"
        >
          {LABELS[tab]} <span className="kn-tab-count">{counts[tab]}</span>
        </Link>
      ))}
    </nav>
  );
}
