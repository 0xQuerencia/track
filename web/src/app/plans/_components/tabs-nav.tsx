import Link from "next/link";
import { PLANS_TABS, PLANS_TAB_LABELS, type PlansTab } from "@/lib/plans/constants";

/** Section switcher. Plain links keep each tab addressable and usable without scripts. */
export function PlansTabs({ active }: { active: PlansTab }) {
  return (
    <nav aria-label="Plans sections" className="pl-tabs">
      <ul>
        {PLANS_TABS.map((tab) => (
          <li key={tab}>
            <Link href={`/plans?tab=${tab}`} aria-current={tab === active ? "page" : undefined}>
              {PLANS_TAB_LABELS[tab]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
