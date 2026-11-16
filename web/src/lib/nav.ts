import {
  Bot,
  Briefcase,
  Brain,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Cpu,
  Crosshair,
  FileText,
  Film,
  GraduationCap,
  MessageCircle,
  History,
  Home,
  HeartPulse,
  Lightbulb,
  Notebook,
  Plug,
  Settings,
  Sparkles,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/*
 * Sidebar and command-palette navigation. Routes may be listed before their
 * pages exist; a missing page shows the standard not-found view.
 */

export type NavLink = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { id: string; label: string; items: readonly NavLink[] };

export const COMMAND_CENTER: NavLink = { href: "/", label: "Command Center", icon: Home };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "life",
    label: "Life",
    items: [
      { href: "/study", label: "Study HQ", icon: BookOpen },
      { href: "/focus", label: "Focus", icon: Crosshair },
      { href: "/plans", label: "Plans & Goals", icon: Target },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/health", label: "Health", icon: HeartPulse },
      { href: "/money", label: "Money", icon: Wallet },
      { href: "/journal", label: "Journal", icon: Notebook },
      { href: "/assistant", label: "Assistant", icon: MessageCircle },
      { href: "/dreamer", label: "Dreamer", icon: Sparkles },
      { href: "/review", label: "Review", icon: ClipboardCheck },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { href: "/projects", label: "Projects", icon: Briefcase },
      { href: "/sessions", label: "AI Sessions", icon: Bot },
      { href: "/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/career", label: "Career", icon: GraduationCap },
    ],
  },
  {
    id: "personal",
    label: "Personal",
    items: [
      { href: "/knowledge", label: "Knowledge", icon: Brain },
      { href: "/media", label: "Media", icon: Film },
      { href: "/people", label: "People", icon: Users },
      { href: "/documents", label: "Documents", icon: FileText },
      { href: "/timeline", label: "Timeline", icon: History },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/devices", label: "Devices", icon: Cpu },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Every page reachable from the sidebar, in display order. */
export const NAV_LINKS: readonly NavLink[] = [
  COMMAND_CENTER,
  ...NAV_GROUPS.flatMap((group) => group.items),
];

/** Whether a nav entry is the current page (the home entry matches only "/"). */
export function isNavActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
