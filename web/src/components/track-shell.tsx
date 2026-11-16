"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { LogOut, Search } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { CommandPalette } from "@/components/track/command-palette";
import { NavGroupSection, useCollapsedGroups } from "@/components/track/nav-group";
import { Wordmark } from "@/components/brand/wordmark";
import { PageMotion } from "@/components/motion/page-motion";
import { COMMAND_CENTER, NAV_GROUPS, isNavActive } from "@/lib/nav";
import { useNavRail } from "@/lib/motion/use-nav-rail";

export function TrackShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  useNavRail(navRef, pathname);
  const { collapsed, toggle } = useCollapsedGroups();

  // The sign-in page stands alone, without the app chrome.
  if (pathname === "/login") return <>{children}</>;

  const CommandIcon = COMMAND_CENTER.icon;
  const commandCurrent = isNavActive(COMMAND_CENTER.href, pathname);

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
          <div className="nav-item-wrap">
            <Link
              href={COMMAND_CENTER.href}
              className="navlink"
              aria-label={COMMAND_CENTER.label}
              aria-current={commandCurrent ? "page" : undefined}
            >
              <CommandIcon aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{COMMAND_CENTER.label}</span>
            </Link>
          </div>
          {NAV_GROUPS.map((group) => (
            <NavGroupSection
              key={group.id}
              group={group}
              pathname={pathname}
              collapsed={collapsed[group.id] === true}
              onToggle={() => toggle(group.id, collapsed[group.id] === true)}
            />
          ))}
        </nav>
      </aside>
      <div className="tk-content">
        <header className="app-topbar tk-topbar">
          <form action="/search" method="get" role="search" className="tk-search">
            <Search aria-hidden="true" size={16} strokeWidth={1.5} />
            <input
              type="search"
              name="q"
              placeholder="Search everything (Ctrl K)"
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
      <CommandPalette />
    </div>
  );
}
