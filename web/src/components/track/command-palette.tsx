"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SearchHit } from "@/lib/crud";
import { NAV_LINKS } from "@/lib/nav";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/*
 * Ctrl/Cmd+K palette. It searches through /api/search, so the whole database
 * never reaches the browser. Dialog supplies the focus trap, focus restore and
 * Escape handling.
 */

const SEARCH_DELAY_MS = 200;
const MIN_TERM = 2;
const RESULT_LIMIT = 20;
const RECENT_KEY = "track.palette.recent";
const RECENT_MAX = 6;

type Recent = { href: string; title: string; detail: string };

type Option = {
  key: string;
  label: string;
  detail: string;
  href: string;
  /** Set for items worth remembering in "Recent". */
  remember?: Recent;
};

type Section = { heading: string; options: Option[] };

type SearchState = { term: string; hits: SearchHit[]; failed: boolean };

/** Quick-create commands. Their routes read ?new= to open the matching form. */
const CREATE_COMMANDS: readonly { label: string; href: string; keywords: string }[] = [
  { label: "New task", href: "/plans?new=task", keywords: "todo add" },
  { label: "New idea", href: "/ideas?new=1", keywords: "add" },
  { label: "New note", href: "/knowledge?new=1", keywords: "add journal" },
];

function isRecent(value: unknown): value is Recent {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.href === "string" &&
    item.href.startsWith("/") &&
    typeof item.title === "string" &&
    typeof item.detail === "string"
  );
}

function readRecent(): Recent[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(item: Recent): void {
  try {
    const next = [item, ...readRecent().filter((entry) => entry.href !== item.href)];
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_MAX)));
  } catch {
    // Storage can be blocked; recents are a convenience only.
  }
}

const pageLabel = (href: string): string =>
  NAV_LINKS.find((link) => link.href === href)?.label ?? href;

function recordOptions(hits: SearchHit[]): Option[] {
  return hits.map((hit) => ({
    key: `record-${hit.entity}-${hit.id}`,
    label: hit.title,
    detail: `${hit.singular} · ${pageLabel(hit.pageHref)}`,
    href: hit.href,
    remember: {
      href: hit.href,
      title: hit.title,
      detail: `${hit.singular} · ${pageLabel(hit.pageHref)}`,
    },
  }));
}

function pageOptions(term: string): Option[] {
  return NAV_LINKS.filter((link) => !term || link.label.toLowerCase().includes(term)).map(
    (link) => ({
      key: `page-${link.href}`,
      label: link.label,
      detail: "Go to",
      href: link.href,
      remember: { href: link.href, title: link.label, detail: "Page" },
    }),
  );
}

function buildSections(term: string, hits: SearchHit[], recent: Recent[]): Section[] {
  if (!term) {
    const sections: Section[] = [];
    if (recent.length)
      sections.push({
        heading: "Recent",
        options: recent.map((item) => ({
          key: `recent-${item.href}`,
          label: item.title,
          detail: item.detail,
          href: item.href,
          remember: item,
        })),
      });
    sections.push({ heading: "Go to", options: pageOptions("") });
    return sections;
  }

  const creates = CREATE_COMMANDS.filter((command) =>
    `${command.label} ${command.keywords}`.toLowerCase().includes(term),
  ).map((command) => ({
    key: `create-${command.href}`,
    label: command.label,
    detail: "Create",
    href: command.href,
  }));
  const sections: Section[] = [];
  if (hits.length) sections.push({ heading: "Records", options: recordOptions(hits) });
  if (creates.length) sections.push({ heading: "Create", options: creates });
  const pages = pageOptions(term);
  if (pages.length) sections.push({ heading: "Go to", options: pages });
  return sections;
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchState | null>(null);
  const [recent] = useState<Recent[]>(() => readRecent());
  const debounced = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);

  useEffect(() => {
    if (debounced.length < MIN_TERM) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(String(response.status))),
      )
      .then((data: { hits: SearchHit[] }) =>
        setResults({ term: debounced, hits: data.hits.slice(0, RESULT_LIMIT), failed: false }),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setResults({ term: debounced, hits: [], failed: true });
      });
    return () => controller.abort();
  }, [debounced]);

  const term = query.trim().toLowerCase();
  const searching = debounced.length >= MIN_TERM && results?.term !== debounced;
  const hits = results?.term === debounced && !results.failed ? results.hits : [];
  const sections = buildSections(term, hits, recent);
  const options = sections.flatMap((section) => section.options);
  const current = options.length ? Math.min(active, options.length - 1) : -1;
  const positionByKey = new Map(options.map((option, position) => [option.key, position]));

  useEffect(() => {
    if (current < 0) return;
    document
      .getElementById(`${baseId}-opt-${current}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [baseId, current]);

  const choose = (option: Option) => {
    if (option.remember) rememberRecent(option.remember);
    onDone();
    router.push(option.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[current]);
    }
  };

  const status = searching
    ? "Searching"
    : term && options.length === 0
      ? "No matches"
      : `${options.length} ${options.length === 1 ? "result" : "results"}`;

  return (
    <div className="tk-palette-body">
      <div className="tk-palette-field">
        <input
          type="text"
          role="combobox"
          aria-label="Search Track"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          placeholder="Search records, go to a page, or create"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p className="tk-sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <div id={listId} role="listbox" aria-label="Results" className="tk-palette-list">
        {sections.map((section, sectionIndex) => {
          const headingId = `${baseId}-h-${sectionIndex}`;
          return (
            <div key={section.heading} role="group" aria-labelledby={headingId}>
              <div id={headingId} className="tk-palette-heading" role="presentation">
                {section.heading}
              </div>
              {section.options.map((option) => {
                const position = positionByKey.get(option.key) ?? -1;
                const isActive = position === current;
                return (
                  <div
                    key={option.key}
                    id={optionId(position)}
                    role="option"
                    aria-selected={isActive}
                    className="tk-palette-option"
                    data-active={isActive || undefined}
                    onMouseMove={() => {
                      if (!isActive) setActive(position);
                    }}
                    onClick={() => choose(option)}
                  >
                    <span className="tk-palette-label">{option.label}</span>
                    <span className="tk-palette-detail">{option.detail}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="tk-palette-hint" aria-hidden="true">
        <kbd>↑</kbd>
        <kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close
      </p>
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="tk-palette" showCloseButton={false}>
        <DialogTitle className="tk-sr-only">Search and navigate</DialogTitle>
        <DialogDescription className="tk-sr-only">
          Find records, jump to a page, or create something new.
        </DialogDescription>
        <PaletteBody onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
