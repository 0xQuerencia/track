"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ingestAction, languagesAction, saveDraftsAction, setVaultAiAction } from "../../vault-actions";
import { DIFFICULTIES, EXAM_CATEGORIES, QUESTION_TYPES, SOURCES } from "@/lib/qv/constants";
import type { Draft } from "@/lib/qv/ingest";
import { MathText } from "@/components/track/math-text";
import type { ChapterChoice } from "./ui";

type Card = {
  key: string;
  imageIds: number[];
  name: string;
  status: string;
  confidence: number | null;
  warnings: string[];
  error: string | null;
  duplicateOf: number | null;
  text: string;
  chapterId: string;
  topic: string;
  subtopic: string;
  qtype: string;
  difficulty: string;
  source: string;
  examCategory: string;
  tags: string;
  correctAnswer: string;
  solution: string;
  notes: string;
};

let counter = 0;
const blank = (over: Partial<Card> = {}): Card => ({
  key: `d${++counter}`, imageIds: [], name: "Typed question", status: "manual", confidence: null, warnings: [], error: null, duplicateOf: null, text: "",
  chapterId: "", topic: "", subtopic: "", qtype: "Other", difficulty: "Medium", source: "Other", examCategory: "General", tags: "", correctAnswer: "", solution: "", notes: "", ...over,
});

function cardsFromDraft(d: Draft & { name: string }): Card[] {
  return d.parts.map((part) =>
    blank({ imageIds: [d.imageId], name: d.name, status: d.status === "ok" && d.engine?.startsWith("ai:") ? "aiok" : d.status, confidence: d.confidence, warnings: d.warnings, error: d.error, duplicateOf: d.duplicateOf, text: part.text, qtype: part.qtype }),
  );
}

const STATUS_TEXT: Record<string, string> = {
  ok: "Text read from the screenshot",
  aiok: "Read by the AI model",
  reused: "Same screenshot as before: text reused",
  empty: "No text found",
  failed: "OCR failed",
  unavailable: "OCR not available",
  manual: "Typed",
};

/** Paste, drop, upload or type; review the text beside the screenshot; then save. Nothing is saved until you press Save. */
export function Capture({ chapters, ai }: { chapters: ChapterChoice[]; ai: { configured: boolean; enabled: boolean } }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [langs, setLangs] = useState<string[]>(["eng"]);
  const [lang, setLang] = useState("eng");
  const [over, setOver] = useState(false);
  const [crop, setCrop] = useState<{ cardKey: string; imageId: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void languagesAction().then((l) => l.length && setLangs(l));
  }, []);

  const ingest = useCallback(
    async (files: File[], replaceKey?: string) => {
      if (!files.length) return;
      setBusy(true);
      setMessages([]);
      const form = new FormData();
      for (const f of files) form.append("file", f);
      form.set("lang", lang);
      try {
        const res = await ingestAction(form);
        if (!res.ok) setMessages([res.error]);
        else {
          const fresh = res.drafts.flatMap(cardsFromDraft);
          setCards((prev) => (replaceKey ? prev.flatMap((c) => (c.key === replaceKey ? fresh.map((f) => ({ ...f, imageIds: [...c.imageIds, ...f.imageIds], chapterId: c.chapterId, source: c.source, difficulty: c.difficulty, examCategory: c.examCategory })) : [c])) : [...prev, ...fresh]));
          setMessages(res.errors);
        }
      } catch {
        setMessages(["The upload failed. Check your connection and try again."]);
      } finally {
        setBusy(false);
      }
    },
    [lang],
  );

  // Ctrl+V anywhere on the page: images become drafts; plain text becomes a typed draft unless a field has focus.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      const target = event.target as HTMLElement | null;
      const inField = target?.closest("input, textarea, select, [contenteditable]");
      if (files.length) {
        event.preventDefault();
        void ingest(files);
        return;
      }
      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (text && !inField && document.querySelector(".qv-capture")) {
        event.preventDefault();
        setCards((prev) => [...prev, blank({ text, name: "Pasted text" })]);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [ingest]);

  const patch = (key: string, change: Partial<Card>) => setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...change } : c)));
  const applyAll = (change: Partial<Card>) => setCards((prev) => prev.map((c) => ({ ...c, ...change })));

  const splitAt = (card: Card, at: number) => {
    const head = card.text.slice(0, at).trimEnd();
    const tail = card.text.slice(at).trimStart();
    if (!head || !tail) return;
    setCards((prev) => prev.flatMap((c) => (c.key === card.key ? [{ ...c, text: head }, { ...c, key: `d${++counter}`, text: tail }] : [c])));
  };

  const save = async () => {
    setBusy(true);
    const payload = cards.map((c) => ({
      text: c.text, imageIds: c.imageIds, chapterId: c.chapterId ? Number(c.chapterId) : null, topic: c.topic, subtopic: c.subtopic, qtype: c.qtype, difficulty: c.difficulty,
      source: c.source, examCategory: c.examCategory, tags: c.tags, correctAnswer: c.correctAnswer, solution: c.solution, notes: c.notes,
    }));
    const res = await saveDraftsAction(JSON.stringify(payload));
    setBusy(false);
    if (res.saved && !res.errors.length) {
      setCards([]);
      setMessages([`Saved ${res.saved} question${res.saved === 1 ? "" : "s"}. They are Unassessed until you grade them.`]);
    } else setMessages(res.errors.length ? res.errors : ["Nothing was saved."]);
  };

  return (
    <section className="qv-capture" aria-label="Add questions">
      <div
        className="qv-drop"
        data-over={over || undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void ingest([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
        }}
      >
        <p>
          <strong>Press Ctrl+V</strong> to paste a screenshot, drop images here, or{" "}
          <button type="button" className="qv-link" onClick={() => fileInput.current?.click()}>upload files</button>.
        </p>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { void ingest([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <div className="qv-drop-actions">
          <button type="button" className="tk-button" onClick={() => setCards((prev) => [...prev, blank()])}>Type a question</button>
          {langs.length > 1 ? (
            <label className="qv-inline">OCR language
              <select value={lang} onChange={(e) => setLang(e.target.value)}>{langs.map((l) => <option key={l}>{l}</option>)}</select>
            </label>
          ) : null}
        </div>
        {ai.configured ? (
          <label className="qv-check">
            <input type="checkbox" checked={ai.enabled} onChange={(e) => void setVaultAiAction(e.target.checked)} /> Let the AI model read my screenshots (images are sent to your AI provider). Much better at maths than the built-in reader.
          </label>
        ) : null}
        <p className="st-inline-note">{ai.configured && ai.enabled ? "Screenshots are read by the AI model; if it fails, the server's Tesseract is used." : "Screenshots are read on this server with Tesseract, which often misreads equations. Check the text against the picture."}</p>
      </div>

      <div role="status" aria-live="polite" className="qv-status">
        {busy ? "Working…" : null}
        {messages.map((m) => <p key={m}>{m}</p>)}
      </div>

      {cards.length ? (
        <div className="qv-drafts">
          <div className="qv-batch">
            <strong>{cards.length} to review</strong>
            <label className="qv-inline">Chapter for all
              <select defaultValue="" onChange={(e) => e.target.value !== "-" && applyAll({ chapterId: e.target.value })}>
                <option value="-">—</option><option value="">Unassigned</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></label>
            <label className="qv-inline">Source for all
              <select defaultValue="" onChange={(e) => e.target.value && applyAll({ source: e.target.value })}><option value="">—</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="qv-inline">Exam for all
              <select defaultValue="" onChange={(e) => e.target.value && applyAll({ examCategory: e.target.value })}><option value="">—</option>{EXAM_CATEGORIES.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          {cards.map((card, index) => (
            <DraftEditor key={card.key} card={card} index={index} chapters={chapters} patch={(c) => patch(card.key, c)} onRemove={() => setCards((p) => p.filter((c) => c.key !== card.key))} onSplit={(at) => splitAt(card, at)} onCrop={() => card.imageIds[0] && setCrop({ cardKey: card.key, imageId: card.imageIds[0] })} />
          ))}
          <div className="tk-form-actions">
            <button type="button" className="tk-button tk-primary" onClick={save} disabled={busy || cards.every((c) => !c.text.trim() && !c.imageIds.length)}>Save {cards.length} question{cards.length === 1 ? "" : "s"}</button>
            <button type="button" className="tk-button tk-ghost" onClick={() => setCards([])} disabled={busy}>Discard all</button>
          </div>
        </div>
      ) : null}
      {crop ? <CropDialog imageId={crop.imageId} onClose={() => setCrop(null)} onDone={(file) => { const key = crop.cardKey; setCrop(null); void ingest([file], key); }} /> : null}
    </section>
  );
}

function DraftEditor({ card, index, chapters, patch, onRemove, onSplit, onCrop }: { card: Card; index: number; chapters: ChapterChoice[]; patch: (c: Partial<Card>) => void; onRemove: () => void; onSplit: (at: number) => void; onCrop: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  return (
    <article className="qv-draft">
      <header>
        <strong>Question {index + 1}</strong>
        <span className="qv-meta">{STATUS_TEXT[card.status] ?? card.status}{card.confidence !== null ? ` · confidence ${card.confidence}%` : ""}</span>
      </header>
      {card.error ? <p className="st-inline-error" role="alert">{card.error}</p> : null}
      {card.warnings.map((w) => <p key={w} className="qv-warn">{w}</p>)}
      {card.duplicateOf ? <p className="qv-warn">This screenshot is already saved on question #{card.duplicateOf}, so it is not stored twice.</p> : null}
      <div className="qv-draft-body">
        {card.imageIds.length ? (
          <div className="qv-draft-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/study/image/${card.imageIds[0]}`} alt={`Screenshot ${card.name}`} />
            <button type="button" className="tk-button tk-ghost" onClick={onCrop}>Crop and re-read</button>
          </div>
        ) : null}
        <div className="qv-draft-form">
          <label className="tk-field"><span>Question text</span>
            <textarea ref={area} rows={6} value={card.text} onChange={(e) => patch({ text: e.target.value })} maxLength={8000} />
          </label>
          {card.text.includes("\\(") || card.text.includes("\\[") ? <div><span className="st-inline-note">Preview</span><MathText className="qv-text qv-math" text={card.text} /></div> : null}
          <div className="st-actions">
            <button type="button" className="tk-button tk-ghost" onClick={() => area.current && onSplit(area.current.selectionStart)}>Split at cursor</button>
            <button type="button" className="tk-button tk-ghost" onClick={onRemove}>Remove</button>
          </div>
          <div className="qv-grid">
            <label className="tk-field"><span>Chapter</span>
              <select value={card.chapterId} onChange={(e) => patch({ chapterId: e.target.value })}>
                <option value="">Choose a chapter</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label className="tk-field"><span>Type</span><select value={card.qtype} onChange={(e) => patch({ qtype: e.target.value })}>{QUESTION_TYPES.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="tk-field"><span>Difficulty</span><select value={card.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>{DIFFICULTIES.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="tk-field"><span>Source</span><select value={card.source} onChange={(e) => patch({ source: e.target.value })}>{SOURCES.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <details>
            <summary>More details</summary>
            <div className="qv-grid">
              <label className="tk-field"><span>Topic</span><input value={card.topic} onChange={(e) => patch({ topic: e.target.value })} /></label>
              <label className="tk-field"><span>Subtopic</span><input value={card.subtopic} onChange={(e) => patch({ subtopic: e.target.value })} /></label>
              <label className="tk-field"><span>Exam</span><select value={card.examCategory} onChange={(e) => patch({ examCategory: e.target.value })}>{EXAM_CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></label>
              <label className="tk-field"><span>Tags</span><input value={card.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="comma, separated" /></label>
              <label className="tk-field"><span>Correct answer (only if you know it)</span><input value={card.correctAnswer} onChange={(e) => patch({ correctAnswer: e.target.value })} /></label>
              <label className="tk-field" data-wide="true"><span>Solution</span><textarea rows={3} value={card.solution} onChange={(e) => patch({ solution: e.target.value })} /></label>
              <label className="tk-field" data-wide="true"><span>My notes</span><textarea rows={2} value={card.notes} onChange={(e) => patch({ notes: e.target.value })} /></label>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

/** Drag a box over the screenshot; the cropped part is read again and replaces this draft's text. */
function CropDialog({ imageId, onClose, onDone }: { imageId: number; onClose: () => void; onDone: (file: File) => void }) {
  const img = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const point = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) };
  };
  const apply = () => {
    const el = img.current;
    if (!el || !box || box.w < 8 || box.h < 8) return;
    const sx = el.naturalWidth / el.clientWidth;
    const sy = el.naturalHeight / el.clientHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(box.w * sx);
    canvas.height = Math.round(box.h * sy);
    canvas.getContext("2d")!.drawImage(el, box.x * sx, box.y * sy, box.w * sx, box.h * sy, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && onDone(new File([blob], "crop.png", { type: "image/png" })), "image/png");
  };
  return (
    <div className="qv-modal" role="dialog" aria-modal="true" aria-label="Crop screenshot">
      <div className="qv-modal-box">
        <p>Drag a box around one question, then read it again.</p>
        <div className="qv-crop" onPointerDown={(e) => { start.current = point(e); setBox(null); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (!start.current) return; const p = point(e); setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) }); }}
          onPointerUp={() => { start.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={img} src={`/api/study/image/${imageId}`} alt="Screenshot to crop" draggable={false} />
          {box ? <span className="qv-crop-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} /> : null}
        </div>
        <div className="tk-form-actions">
          <button type="button" className="tk-button tk-primary" onClick={apply} disabled={!box || box.w < 8}>Read this part</button>
          <button type="button" className="tk-button tk-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
