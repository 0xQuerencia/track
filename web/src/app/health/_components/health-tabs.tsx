import Link from "next/link";
import { HEALTH_TABS, HEALTH_TAB_LABELS, type HealthTab } from "@/lib/health/constants";

/** Section switcher for /health. Plain links, so every tab is addressable. */
export function HealthTabs({ active }: { active: HealthTab }) {
  return (
    <nav aria-label="Health sections" className="hl-tabs">
      <ul>
        {HEALTH_TABS.map((tab) => (
          <li key={tab}>
            <Link href={`/health?tab=${tab}`} aria-current={tab === active ? "page" : undefined}>
              {HEALTH_TAB_LABELS[tab]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
