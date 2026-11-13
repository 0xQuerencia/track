"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export type WidgetSpec = {
  id: string;
  title: string;
  wide?: boolean;
  content: ReactNode;
};

export type LayoutPreset = {
  id: string;
  label: string;
  order: string[];
  hidden: string[];
};

type Layout = { order: string[]; hidden: string[] };

const STORAGE_KEY = "track.home.layout";

function reconcile(layout: Layout, ids: string[]): Layout {
  const known = layout.order.filter((id) => ids.includes(id));
  const order = [...known, ...ids.filter((id) => !known.includes(id))];
  return { order, hidden: layout.hidden.filter((id) => ids.includes(id)) };
}

function readLayout(ids: string[]): Layout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Layout>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return reconcile(
      {
        order: parsed.order.map(String),
        hidden: parsed.hidden.map(String),
      },
      ids,
    );
  } catch {
    return null;
  }
}

/** Home widgets you can hide, reorder, and switch between saved layouts. The choice lives in this browser. */
export function WidgetBoard({
  widgets,
  presets,
}: {
  widgets: WidgetSpec[];
  presets: LayoutPreset[];
}) {
  const ids = widgets.map((w) => w.id);
  const [layout, setLayout] = useState<Layout>({ order: ids, hidden: [] });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const stored = readLayout(ids);
    if (stored) setLayout(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids are stable for a given page build
  }, []);

  const apply = (next: Layout) => {
    const clean = reconcile(next, ids);
    setLayout(clean);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      /* Layout still applies for this visit. */
    }
  };

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const move = (id: string, delta: -1 | 1) => {
    const order = [...layout.order];
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    apply({ ...layout, order });
  };
  const toggle = (id: string) =>
    apply({
      ...layout,
      hidden: layout.hidden.includes(id)
        ? layout.hidden.filter((h) => h !== id)
        : [...layout.hidden, id],
    });

  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <section aria-label="Dashboard widgets" className="tk-board">
      <div className="tk-board-bar">
        <button
          type="button"
          className="tk-button tk-ghost"
          aria-pressed={editing}
          onClick={() => setEditing((v) => !v)}
        >
          <SlidersHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
          {editing ? "Done" : "Customize"}
        </button>
        {editing ? (
          <div className="tk-presets" role="group" aria-label="Layouts">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="tk-button tk-ghost"
                onClick={() => apply({ order: preset.order, hidden: preset.hidden })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {editing && layout.hidden.length > 0 ? (
        <div className="tk-hidden-list">
          <span>Hidden:</span>
          {layout.hidden.map((id) => (
            <button key={id} type="button" className="tk-chip" onClick={() => toggle(id)}>
              <Eye size={12} strokeWidth={1.5} aria-hidden="true" /> {byId.get(id)?.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="tk-widgets">
        {visible.map((id) => {
          const widget = byId.get(id);
          if (!widget) return null;
          const index = layout.order.indexOf(id);
          return (
            <article
              key={id}
              className="tk-widget"
              data-wide={widget.wide || undefined}
              data-editing={editing || undefined}
            >
              <header className="tk-widget-head">
                <h2>{widget.title}</h2>
                {editing ? (
                  <div className="tk-widget-tools">
                    <button
                      type="button"
                      aria-label={`Move ${widget.title} earlier`}
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${widget.title} later`}
                      disabled={index === layout.order.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Hide ${widget.title}`}
                      onClick={() => toggle(id)}
                    >
                      <EyeOff size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ) : null}
              </header>
              {widget.content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
