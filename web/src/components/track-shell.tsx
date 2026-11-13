"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  BookMarked,
  BookOpen,
  Briefcase,
  Crosshair,
  HeartPulse,
  Home,
  LogOut,
  NotebookPen,
  Notebook,
  Search,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Wordmark } from "@/components/brand/wordmark";
import { PageMotion } from "@/components/motion/page-motion";
import { useNavRail } from "@/lib/motion/use-nav-rail";

type NavItem = { href: string; label: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { href: "/", label: "Command Center", icon: Home },
  { href: "/study", label: "Study HQ", icon: BookOpen },
  { href: "/focus", label: "Focus", icon: Crosshair },
  { href: "/plans", label: "Plans", icon: NotebookPen },
  { href: "/health", label: "Health", icon: HeartPulse },
  { href: "/media", label: "Media", icon: BookMarked },
  { href: "/projects", label: "Projects", icon: Briefcase },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/journal", label: "Journal", icon: Notebook },
];

export function TrackShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  useNavRail(navRef, pathname);

  // The sign-in page stands alone, without the app chrome.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="shell tk-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Track, home">
          <Wordmark size="sm" />
          <small>Life operating system</small>
        </Link>
        <nav ref={navRef} aria-label="Application" className="primary-nav">
          <span className="nav-indicator" aria-hidden="true" />
          <span className="nav-hover" aria-hidden="true" />
          {navItems.map(({ href, label, icon: Icon }) => {
            const current =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <div className="nav-item-wrap" key={href}>
                <Link
                  href={href}
                  className="navlink"
                  aria-label={label}
                  aria-current={current ? "page" : undefined}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
                  <span>{label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="tk-content">
        <header className="app-topbar tk-topbar">
          <form action="/search" method="get" role="search" className="tk-search">
            <Search aria-hidden="true" size={16} strokeWidth={1.5} />
            <input
              type="search"
              name="q"
              placeholder="Search everything"
              aria-label="Search everything"
              minLength={2}
              maxLength={80}
            />
          </form>
          <form action={logoutAction}>
            <button type="submit" className="tk-button tk-ghost">
              <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </header>
        <PageMotion>{children}</PageMotion>
      </div>
    </div>
  );
}
