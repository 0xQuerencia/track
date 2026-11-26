import Link from "next/link";
import { Markdown } from "@/components/track/markdown";
import { Page, Panel } from "@/components/track/page";
import { getDb } from "@/lib/db";
import { shortDay, todayStr } from "@/lib/dates";
import { runDailyCycle } from "@/lib/dreamer/cycle";
import { getAiDisclosurePreview, getSourcesPrivacy, latestRun, listBriefs, countInsights, INSIGHT_PAGE_SIZE, listGraphLinks, listInsights, listSourceRecords, listSuggestions } from "@/lib/dreamer/queries";
import { INSIGHT_KINDS } from "@/lib/dreamer/types";
import {
  deleteAllDreamerAction,
  feedbackSuggestionAction,
  reviewInsightAction,
  runDreamerAction,
  runWeeklyReflectionAction,
  saveExclusionsAction,
  setDreamerConsentAction,
  setEntryEnabledAction,
  setSourceEnabledAction,
  updateGraphLinkAction,
} from "./actions";
import "@/styles/dreamer.css";
import "@/styles/dreamer-collective.css";
import { ChiefPanel } from "./chief-panel";

export const dynamic = "force-dynamic";

const TABS = ["chief", "brief", "insights", "suggestions", "graph", "weekly", "sources"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
  chief: "Chief", brief: "Brief", insights: "Insights", suggestions: "Suggestions", graph: "Graph", weekly: "Weekly", sources: "Sources & Privacy",
};

export default async function DreamerPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string; state?: string; page?: string }> }) {
  const params = await searchParams;
  const activeTab: Tab = TABS.includes(params.tab as Tab) ? params.tab as Tab : "chief";
  const db = getDb();
  await runDailyCycle(db);
  const date = todayStr();
  const briefs = listBriefs(db, "daily");
  const latestDaily = latestRun(db, "daily");
  const weekly = listBriefs(db, "weekly");
  const consentView = getSourcesPrivacy(db);
  const disclosure = getAiDisclosurePreview(db);

  return (
    <Page kicker="Journal intelligence · local first" title="Dreamer" lede="A reviewable layer over your journal, notes, ideas, projects and goals. Local analysis is always available; external AI is optional and gated by your consent.">
      <nav className="dreamer-tabs" aria-label="Dreamer sections">
        {TABS.map((tab) => <Link key={tab} href={`/dreamer?tab=${tab}`} aria-current={activeTab === tab ? "page" : undefined}>{LABELS[tab]}</Link>)}
        <Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/studio">Studio</Link><Link href="/dreamer/schedules">Schedules</Link><Link href="/dreamer/inbox">Inbox</Link>
      </nav>
      {activeTab === "chief" ? <ChiefPanel /> : null}
      {activeTab === "brief" ? <BriefSection date={date} body={briefs[0]?.period_key === date ? briefs[0].body_md : null} run={latestDaily} disclosure={disclosure} aiEnabled={consentView.consent.enabled} sourcesEnabled={consentView.sources.some((source) => source.enabled)} /> : null}
      {activeTab === "insights" ? <InsightSection kind={params.kind} state={params.state} page={params.page} /> : null}
      {activeTab === "suggestions" ? <SuggestionSection /> : null}
      {activeTab === "graph" ? <GraphSection /> : null}
      {activeTab === "weekly" ? <WeeklySection weekly={weekly} /> : null}
      {activeTab === "sources" ? <SourcesSection view={consentView} disclosure={disclosure} /> : null}
    </Page>
  );
}

function BriefSection({ date, body, run, disclosure, aiEnabled, sourcesEnabled }: {
  date: string; body: string | null; run: ReturnType<typeof latestRun>;
  disclosure: ReturnType<typeof getAiDisclosurePreview>; aiEnabled: boolean; sourcesEnabled: boolean;
}) {
  return (
    <Panel title="Morning brief" description="A daily scan runs once per local date. Re-running the page returns the same cycle.">
      {body ? <Markdown source={body} className="dreamer-brief" /> : <p className="tk-empty">{sourcesEnabled ? "Nothing new yet. The local baseline will check permitted sources on this page." : "Dreamer is paused because every source is disabled. Enable a source in Sources & Privacy."}</p>}
      <p className="dreamer-run-meta">{run ? `Last run ${run.finished_at ?? run.started_at} · ${run.new_insights} candidate insights · ${run.new_suggestions} suggestions` : `No completed run for ${shortDay(date)} yet.`}</p>
      {run ? <AiRunNotice notes={run.notes} /> : null}
      <form action={runDreamerAction} className="dreamer-run-form">
        {aiEnabled ? <>
          <input type="hidden" name="disclosure_items" value={JSON.stringify(disclosure.items)} />
          <DisclosurePreview disclosure={disclosure} />
          <label><input type="checkbox" name="send_to_ai" disabled={disclosure.items.length === 0} /> Send the preview above to AI for this run</label>
        </> : <p className="tk-empty-small">Local only. To use AI, review consent in Sources &amp; Privacy.</p>}
        <button className="tk-button" type="submit">Run Dreamer now</button>
      </form>
      <p className="dreamer-tab-link"><Link href="/dreamer?tab=sources">Review sources, privacy and the AI disclosure →</Link></p>
    </Panel>
  );
}

function AiRunNotice({ notes }: { notes: string | null }) {
  if (!notes) return null;
  const message = aiNoticeFrom(notes);
  return message ? <p className="dreamer-notice" role="status">{message}</p> : null;
}

function aiNoticeFrom(notes: string): string | null {
  try {
    const value: unknown = JSON.parse(notes);
    if (typeof value === "object" && value !== null && "aiNotice" in value && typeof value.aiNotice === "string")
      return value.aiNotice;
  } catch { /* older run notes can be plain text */ }
  return notes.includes("AI enhancement unavailable") ? notes : null;
}

function InsightSection({ kind, state, page }: { kind?: string; state?: string; page?: string }) {
  const validKind = INSIGHT_KINDS.includes(kind as (typeof INSIGHT_KINDS)[number]) ? kind : undefined;
  const states = ["new", "accepted", "corrected", "dismissed", "outdated", "blocked"] as const;
  const validState = states.includes(state as (typeof states)[number]) ? state : undefined;
  const total = countInsights(getDb(), { kind: validKind, state: validState });
  const pageCount = Math.max(1, Math.ceil(total / INSIGHT_PAGE_SIZE));
  const current = Math.min(pageCount, Math.max(1, Number.parseInt(page ?? "1", 10) || 1));
  const insights = listInsights(getDb(), { kind: validKind, state: validState, page: current });
  const pageHref = (target: number) => `/dreamer?${new URLSearchParams({ tab: "insights", ...(validKind ? { kind: validKind } : {}), ...(validState ? { state: validState } : {}), page: String(target) })}`;
  return (
    <Panel title="Candidate insights" description="Every inferred observation stays a hypothesis until you review it. Confidence is a local evidence score, not certainty.">
      <form method="get" action="/dreamer" className="dreamer-filter-form">
        <input type="hidden" name="tab" value="insights" />
        <label>Kind<select name="kind" defaultValue={validKind ?? ""}><option value="">All kinds</option>{INSIGHT_KINDS.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label>Review state<select name="state" defaultValue={validState ?? ""}><option value="">All states</option>{states.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <button className="tk-button tk-ghost" type="submit">Filter</button>
      </form>
      {insights.length === 0 ? <p className="tk-empty">No candidate insights yet. Add or enable journal, note or idea sources, then run Dreamer.</p> : (
        <div className="dreamer-cards">
          {insights.map((insight) => <article className="dreamer-card" key={insight.id}>
            <header><p className="tk-kicker">{insight.kind.replaceAll("_", " ")} · <span className="dreamer-state" data-state={insight.state}>{insight.state}</span> · {Math.round(insight.confidence * 100)}% evidence score</p><h3>{insight.text}</h3>
              {insight.origin === "ai" ? <p className="dreamer-ai-label">AI-drafted hypothesis</p> : null}
            </header>
            <p>{insight.uncertainty}</p>
            <small>First detected {insight.firstDetected} · last confirmed {insight.lastConfirmed}</small>
            <EvidenceList items={insight.evidence} />
            {insight.projects.length ? <p>Related project records: {insight.projects.map((project) => project.name).join(", ")}</p> : null}
            <div className="dreamer-actions">
              {(["accepted", "dismissed", "outdated"] as const).map((state) => <form action={reviewInsightAction} key={state}>
                <input type="hidden" name="id" value={insight.id} /><input type="hidden" name="action" value={state} />
                <button className="tk-button tk-ghost" type="submit">{state[0]?.toUpperCase() + state.slice(1)}</button>
              </form>)}
            </div>
            <details className="dreamer-more">
              <summary>More: correct, never use, delete</summary>
              <form action={reviewInsightAction} className="dreamer-correct-form">
                <input type="hidden" name="id" value={insight.id} /><input type="hidden" name="action" value="corrected" />
                <label>Correct this insight<textarea name="user_text" defaultValue={insight.state === "corrected" ? insight.text : insight.originalText} maxLength={3000} required /></label>
                <button className="tk-button tk-ghost" type="submit">Save correction</button>
              </form>
              <div className="dreamer-actions">
                <form action={reviewInsightAction}><input type="hidden" name="id" value={insight.id} /><input type="hidden" name="action" value="blocked" /><button className="tk-button tk-ghost" type="submit">Never use</button></form>
                <form action={reviewInsightAction}><input type="hidden" name="id" value={insight.id} /><input type="hidden" name="action" value="delete" /><button className="tk-button tk-ghost" type="submit">Delete derived data</button></form>
              </div>
            </details>
          </article>)}
        </div>
      )}
      {pageCount > 1 ? <nav className="dreamer-pager" aria-label="Insight pages">
        {current > 1 ? <Link href={pageHref(current - 1)}>← Previous</Link> : <span />}
        <span>Page {current} of {pageCount} · {total} insights</span>
        {current < pageCount ? <Link href={pageHref(current + 1)}>Next →</Link> : <span />}
      </nav> : null}
    </Panel>
  );
}

function SuggestionSection() {
  const suggestions = listSuggestions(getDb());
  const feedback = [
    ["useful", "Useful"], ["save_later", "Save for later"], ["explore", "Explore"],
    ["convert_to_project", "Convert to project"], ["already_implemented", "Already implemented"],
    ["not_relevant", "Not relevant"], ["dont_suggest_again", "Don’t suggest again"],
  ] as const;
  return (
    <Panel title="Grounded suggestions" description="Dreamer only proposes when repeated evidence supports a practical experiment. Source-backed evidence and new hypotheses are shown separately.">
      {suggestions.length === 0 ? <p className="tk-empty">No suggestions meet the evidence threshold. Dreamer will not fill a quota.</p> : (
        <div className="dreamer-cards">
          {suggestions.map((item) => <article className="dreamer-card" key={item.id}>
            <header><p className="tk-kicker">{item.state} · {item.origin === "ai" ? "AI-drafted hypothesis" : "Local baseline"}</p><h3>{item.title}</h3></header>
            <div className="dreamer-evidence-split">
              <section><h4>Evidence-backed observation</h4><p>{item.problem}</p><p>{item.whyItMatters}</p><EvidenceList items={item.evidence} /></section>
              <section><h4>New hypothesis to test</h4><p>{item.usefulness}</p><dl><dt>Difficulty</dt><dd>{item.difficulty}</dd><dt>Dependencies</dt><dd>{item.dependencies}</dd><dt>Smallest prototype</dt><dd>{item.prototype}</dd><dt>Next steps</dt><dd><Markdown source={item.nextSteps} /></dd><dt>Uncertainties</dt><dd>{item.uncertainties}</dd></dl></section>
            </div>
            {item.projects.length ? <p>Projects that could be reused: {item.projects.map((project) => project.name).join(", ")}</p> : null}
            <div className="dreamer-actions dreamer-feedback">
              {feedback.map(([choice, label]) => <form action={feedbackSuggestionAction} key={choice}>
                <input type="hidden" name="id" value={item.id} /><button className="tk-button tk-ghost" type="submit" name="choice" value={choice}>{label}</button>
              </form>)}
            </div>
            {item.feedback.length ? <small>Last feedback: {item.feedback[0]?.choice.replaceAll("_", " ")}{item.feedback[0]?.note ? ` · ${item.feedback[0].note}` : ""}</small> : null}
          </article>)}
        </div>
      )}
    </Panel>
  );
}

function EvidenceList({ items }: { items: { id: number; quote: string; date: string; href: string }[] }) {
  if (!items.length) return <p className="tk-empty-small">No supporting excerpts remain.</p>;
  return <ul className="dreamer-evidence-list">{items.map((item) => <li key={item.id}><Link href={item.href}><time>{item.date}</time></Link><q>{item.quote}</q></li>)}</ul>;
}

function GraphSection() {
  const links = listGraphLinks(getDb());
  return <Panel title="Inspectable connections" description="Proposed links keep their evidence and polarity. Confirm, reject or leave each edge for later review.">
    {links.length === 0 ? <p className="tk-empty">No connections found yet. Project, goal, task and idea name/tag overlaps are checked locally.</p> : <ol className="dreamer-graph-list">
      {links.map((link) => <li key={link.id}>
        <div><b>{link.fromKind} {link.fromId}</b><span aria-hidden="true"> → </span><b>{link.toKind}: {link.toTitle}</b><small>{link.relation} · {link.polarity < 0 ? "contradictory evidence" : "supporting evidence"} · {link.state}</small></div>
        <EvidenceList items={link.evidence} />
        <div className="dreamer-actions">{(["confirmed", "rejected", "proposed"] as const).map((state) => <form action={updateGraphLinkAction} key={state}>
          <input type="hidden" name="id" value={link.id} /><input type="hidden" name="state" value={state} />
          <button className="tk-button tk-ghost" type="submit">{state === "proposed" ? "Undo review" : state}</button>
        </form>)}</div>
      </li>)}
    </ol>}
  </Panel>;
}

function WeeklySection({ weekly }: { weekly: ReturnType<typeof listBriefs> }) {
  const date = todayStr();
  const now = new Date(`${date}T00:00:00Z`);
  now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const monday = now.toISOString().slice(0, 10);
  return <>
    <Panel title="Weekly deep reflection" description="All weekly observations are hypotheses requiring your judgment. Re-running the same ISO week returns the saved review.">
      <form action={runWeeklyReflectionAction}><input type="hidden" name="week_start" value={monday} /><button className="tk-button" type="submit">Run this week’s reflection</button></form>
      {weekly.length === 0 ? <p className="tk-empty">No weekly reflection has been saved yet.</p> : null}
    </Panel>
    {weekly.map((review) => <Panel key={review.id} title={`Week of ${review.period_key}`}><Markdown source={review.body_md} className="dreamer-brief" /></Panel>)}
  </>;
}

function SourcesSection({ view, disclosure }: { view: ReturnType<typeof getSourcesPrivacy>; disclosure: ReturnType<typeof getAiDisclosurePreview> }) {
  const entries = listSourceRecords(getDb());
  const categories = [...new Set([...view.categories, ...view.excludedCategories])].sort();
  const tags = [...new Set([...view.tags, ...view.excludedTags])].sort();
  return <>
    <Panel title="Local source controls" description="Source, category, tag and entry exclusions are enforced before local analysis. Excluded entries lose their derived evidence and links.">
      <div className="dreamer-source-list">
        {view.sources.map(({ source, enabled }) => <div key={source} className="dreamer-source-row"><div><b>{sourceLabel(source)}</b><small>{enabled ? "Local analysis enabled" : "Analysis paused; derived entries purged"}</small></div>
          <form action={setSourceEnabledAction.bind(null, source, !enabled)}><button className="tk-button tk-ghost" type="submit">{enabled ? "Disable source" : "Enable source"}</button></form>
        </div>)}
      </div>
      <form action={saveExclusionsAction} className="dreamer-exclusion-form">
        <fieldset><legend>Exclude categories</legend>{categories.length ? categories.map((category) => <label key={category}><input type="checkbox" name="excluded_categories" value={category} defaultChecked={view.excludedCategories.includes(category.toLowerCase())} /> {category}</label>) : <p className="tk-empty-small">No categories available.</p>}</fieldset>
        <fieldset><legend>Exclude tags</legend>{tags.length ? tags.map((tag) => <label key={tag}><input type="checkbox" name="excluded_tags" value={tag} defaultChecked={view.excludedTags.includes(tag.toLowerCase())} /> {tag}</label>) : <p className="tk-empty-small">No tags available.</p>}</fieldset>
        <button className="tk-button" type="submit">Save category and tag exclusions</button>
      </form>
      <h3>Recent entries</h3>
      {entries.length ? <ul className="dreamer-entry-list">{entries.map((entry) => <li key={`${entry.source}:${entry.refId}`}><Link href={entry.href}>{entry.title}</Link><small>{entry.source} · {entry.date} · {entry.enabled ? "included" : "excluded"}</small><form action={setEntryEnabledAction.bind(null, entry.source, entry.refId, !entry.enabled)}><button className="tk-button tk-ghost" type="submit">{entry.enabled ? "Exclude" : "Include"}</button></form></li>)}</ul> : <p className="tk-empty">No journal entries, notes or ideas are available.</p>}
      {view.entries.length ? <p className="dreamer-muted">Excluded entries remembered: {view.entries.map((entry) => `${entry.source} #${entry.ref_id}`).join(", ")}</p> : null}
    </Panel>
    <Panel title="Optional AI and disclosure" description="Layer A is local and always available. Layer B can send only the redacted excerpts listed here after consent and per-run confirmation.">
      <dl className="dreamer-status"><dt>Provider key</dt><dd>{view.aiStatus.keyConfigured ? "Configured" : "Not configured"}</dd><dt>Default model</dt><dd>{view.aiStatus.defaultModel || "Not configured"}</dd><dt>Global kill switch</dt><dd>{view.aiStatus.killSwitch ? "Enabled — AI calls disabled" : "Off"}</dd><dt>Dreamer consent</dt><dd>{view.consent.enabled ? "Enabled" : "Off"}</dd></dl>
      <form action={setDreamerConsentAction} className="dreamer-consent-form">
        <label><input type="checkbox" name="enabled" defaultChecked={view.consent.enabled} /> Allow optional AI enhancement for Dreamer</label>
        <label><input type="checkbox" name="allow_daily" defaultChecked={view.consent.scope.allowDailyCycle} /> Always allow AI in the daily cycle</label>
        <p className="tk-empty-small">Without the second option, each run needs the explicit checkbox in the Brief tab.</p>
        <button className="tk-button" type="submit">Save AI consent</button>
      </form>
      <DisclosurePreview disclosure={disclosure} />
    </Panel>
    <Panel title="Export and deletion" description="Exports include Dreamer-derived evidence excerpts. Keep the download private.">
      <p><Link className="tk-button tk-ghost" href="/api/dreamer/export">Export Dreamer data as JSON</Link></p>
      <form action={deleteAllDreamerAction} className="dreamer-delete-form">
        <label>Type DELETE to remove Dreamer analysis, insights, suggestions, feedback, briefs and all durable missions/reports. Sources and AI consent are paused afterward.<input name="confirm" autoComplete="off" maxLength={6} required /></label>
        <button className="tk-button tk-danger" type="submit">Delete all Dreamer data</button>
      </form>
    </Panel>
  </>;
}

function DisclosurePreview({ disclosure }: { disclosure: ReturnType<typeof getAiDisclosurePreview> }) {
  return <details className="dreamer-disclosure" open>
    <summary>Preview what would be sent · {disclosure.items.length} excerpts · {disclosure.totalChars} characters</summary>
    <p>Purpose: {disclosure.purpose}. Model: {disclosure.model}. Raw source entries are not sent.</p>
    {disclosure.items.length ? <ol>{disclosure.items.map((item) => <li key={item.id}><small>{item.label}</small><q>{item.text}</q></li>)}</ol> : <p className="tk-empty">No permitted evidence excerpt is ready to disclose.</p>}
  </details>;
}

function sourceLabel(source: string): string {
  return source === "note" ? "Knowledge Base notes" : source === "idea" ? "Idea Vault" : "Journal";
}
