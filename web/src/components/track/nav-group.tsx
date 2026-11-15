"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isNavActive, type NavGroup as NavGroupDef } from "@/lib/nav";

/*
 * Collapsed state for the sidebar groups. It is read from localStorage on the
 * client only; the server snapshot is "all open", so server and client markup
 * match on the first render. Storage failures fall back to all open.
 */

const STORAGE_KEY = "track.nav.collapsed";
type Collapsed = Readonly<Record<string, boolean>>;
const NONE: Collapsed = {};

let snapshot: Collapsed | null = null;
const listeners = new Set<() => void>();

function readStored(): Collapsed {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NONE;
    const clean: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed))
      if (typeof value === "boolean") clean[key] = value;
    return clean;
  } catch {
    return NONE;
  }
}

function getSnapshot(): Collapsed {
  snapshot ??= readStored();
  return snapshot;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function setCollapsed(id: string, collapsed: boolean): void {
  const next = { ...getSnapshot(), [id]: collapsed };
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the change still applies for this visit.
  }
  listeners.forEach((notify) => notify());
}

export function useCollapsedGroups(): {
  collapsed: Collapsed;
  toggle: (id: string, current: boolean) => void;
} {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => NONE);
  return {
    collapsed,
    toggle: (id, current) => setCollapsed(id, !current),
  };
}

export function NavGroupSection({
  group,
  pathname,
  collapsed,
  onToggle,
}: {
  group: NavGroupDef;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const holdsCurrent = group.items.some((item) => isNavActive(item.href, pathname));
  // The group holding the current page is always open, so the active row is visible.
  const open = holdsCurrent || !collapsed;
  const listId = `nav-group-${group.id}`;

  return (
    <div className="nav-group" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="nav-group-head"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={holdsCurrent || undefined}
        title={holdsCurrent ? "Open while you are on one of its pages" : undefined}
        onClick={() => {
          if (!holdsCurrent) onToggle();
        }}
      >
        <span>{group.label}</span>
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.5} className="nav-group-chevron" />
      </button>
      <div id={listId} className="nav-group-list" hidden={!open}>
        {group.items.map(({ href, label, icon: Icon }) => {
          const current = isNavActive(href, pathname);
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
      </div>
    </div>
  );
}
