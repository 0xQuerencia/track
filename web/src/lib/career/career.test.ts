import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { deadlineBadge } from "./deadlines";
import { getCareerDeadlines, getUpcomingOpportunities } from "./index";
import {
  createOpportunity,
  deleteOpportunity,
  parseOpportunityForm,
  setOpportunityStatus,
  updateOpportunity,
} from "./repo";
import { parseCareerParams, careerHref } from "./params";
import {
  boardOpportunities,
  listOpportunities,
  opportunityHistory,
  opportunityStats,
  recentMilestones,
} from "./queries";

const TODAY = "2026-11-15";
const values = (overrides: Record<string, string | number | null> = {}) => ({
  title: "Summer scholarship",
  org: "Example Foundation",
  kind: "Scholarship",
  status: "Interested",
  deadline: "2026-11-20",
  url: null,
  notes: null,
  priority: "High",
  achieved_on: null,
  ...overrides,
});

describe("career status history", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("records the initial status on create and each real change on update", () => {
    const id = createOpportunity(values());
    assert.deepEqual(
      opportunityHistory(id).map((h) => [h.from_status, h.to_status]),
      [[null, "Interested"]],
    );

    assert.equal(setOpportunityStatus(id, "Preparing"), true);
    assert.equal(setOpportunityStatus(id, "Applied"), true);
    assert.deepEqual(
      opportunityHistory(id).map((h) => [h.from_status, h.to_status]),
      [
        [null, "Interested"],
        ["Interested", "Preparing"],
        ["Preparing", "Applied"],
      ],
    );
  });

  it("does not record a change when the status is set to the value it already has", () => {
    const id = createOpportunity(values({ status: "Preparing" }));
    assert.equal(setOpportunityStatus(id, "Preparing"), true);
    assert.equal(opportunityHistory(id).length, 1);
  });

  it("records a status change made through a plain update, and not an unchanged one", () => {
    const id = createOpportunity(values());
    updateOpportunity(id, values({ title: "Renamed", status: "Interested" }));
    assert.equal(opportunityHistory(id).length, 1, "title edit adds no history");
    updateOpportunity(id, values({ title: "Renamed", status: "Accepted" }));
    assert.equal(opportunityHistory(id).at(-1)?.to_status, "Accepted");
  });

  it("rejects an unknown status and an unknown opportunity", () => {
    const id = createOpportunity(values());
    assert.equal(setOpportunityStatus(id, "Winning"), false);
    assert.equal(setOpportunityStatus(9999, "Applied"), false);
  });

  it("removes the history with the opportunity", () => {
    const id = createOpportunity(values());
    setOpportunityStatus(id, "Applied");
    deleteOpportunity(id);
    const left = getDb()
      .prepare("SELECT COUNT(*) AS n FROM career_history WHERE opportunity_id = ?")
      .get(id) as { n: number };
    assert.equal(left.n, 0);
  });

  it("validates the form, requiring a title and a real status", () => {
    const form = new FormData();
    form.set("title", "");
    form.set("status", "Interested");
    assert.ok("error" in parseOpportunityForm(form));

    const bad = new FormData();
    bad.set("title", "Hack night");
    bad.set("status", "Winning");
    assert.ok("error" in parseOpportunityForm(bad));

    const good = new FormData();
    good.set("title", "Hack night");
    good.set("status", "Applied");
    good.set("kind", "Hackathon");
    good.set("deadline", "2026-12-01");
    const parsed = parseOpportunityForm(good);
    assert.ok("values" in parsed);
    assert.equal(parsed.values.deadline, "2026-12-01");
  });
});

describe("career deadlines and filters", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("computes overdue only while the opportunity still awaits action", () => {
    assert.equal(deadlineBadge("2026-11-10", "Interested", TODAY)?.tone, "overdue");
    assert.equal(deadlineBadge("2026-11-10", "Applied", TODAY)?.tone, "passed");
    assert.equal(deadlineBadge("2026-11-15", "Preparing", TODAY)?.label, "Due today");
    assert.equal(deadlineBadge("2026-11-18", "Preparing", TODAY)?.label, "Due in 3 days");
    assert.equal(deadlineBadge("2026-12-15", "Preparing", TODAY)?.label, "30 days left");
    assert.equal(deadlineBadge(null, "Preparing", TODAY), null);
  });

  it("counts the overdue, open and due-soon figures from real rows", () => {
    createOpportunity(values({ title: "A", deadline: "2026-11-01", status: "Interested" }));
    createOpportunity(values({ title: "B", deadline: "2026-11-01", status: "Applied" }));
    createOpportunity(values({ title: "C", deadline: "2026-11-25", status: "Preparing" }));
    createOpportunity(values({ title: "D", deadline: "2026-11-25", status: "Accepted" }));
    createOpportunity(values({ title: "E", deadline: null, kind: "Achievement", status: "Completed", achieved_on: "2026-10-01" }));

    const stats = opportunityStats(TODAY);
    assert.deepEqual(
      { total: stats.total, open: stats.open, overdue: stats.overdue, dueWithin30: stats.dueWithin30, accepted: stats.accepted, milestones: stats.milestones },
      { total: 5, open: 3, overdue: 1, dueWithin30: 1, accepted: 1, milestones: 1 },
    );
  });

  it("filters the list by window and orders by deadline with no-deadline items last", () => {
    createOpportunity(values({ title: "Late", deadline: "2026-12-30" }));
    createOpportunity(values({ title: "Soon", deadline: "2026-11-18" }));
    createOpportunity(values({ title: "None", deadline: null }));

    const next30 = listOpportunities({ kind: null, status: null, window: "next30" }, 1, TODAY);
    assert.deepEqual(next30.rows.map((r) => r.title), ["Soon"]);

    const all = listOpportunities({ kind: null, status: null, window: "all" }, 1, TODAY);
    assert.deepEqual(all.rows.map((r) => r.title), ["Soon", "Late", "None"]);

    const none = listOpportunities({ kind: null, status: null, window: "none" }, 1, TODAY);
    assert.deepEqual(none.rows.map((r) => r.title), ["None"]);
  });

  it("paginates the list and clamps an out-of-range page", () => {
    for (let i = 0; i < 30; i++) createOpportunity(values({ title: `Item ${i}`, deadline: null }));
    const second = listOpportunities({ kind: null, status: null, window: "all" }, 2, TODAY);
    assert.equal(second.pageCount, 2);
    assert.equal(second.rows.length, 5);
    const clamped = listOpportunities({ kind: null, status: null, window: "all" }, 99, TODAY);
    assert.equal(clamped.page, 2);
  });

  it("groups the board by status using the same filters", () => {
    createOpportunity(values({ title: "Interest", status: "Interested", kind: "Hackathon", deadline: null }));
    createOpportunity(values({ title: "Scholar", status: "Applied", kind: "Scholarship", deadline: null }));
    const board = boardOpportunities({ kind: "Hackathon", window: "all" }, TODAY);
    assert.deepEqual(board.rows.map((r) => r.title), ["Interest"]);
    assert.equal(board.truncated, false);
  });

  it("returns milestones with dates, newest first", () => {
    createOpportunity(values({ title: "Old", kind: "Achievement", deadline: null, achieved_on: "2025-01-02" }));
    createOpportunity(values({ title: "New", kind: "Portfolio", deadline: null, achieved_on: "2026-03-04" }));
    createOpportunity(values({ title: "Undated", kind: "Achievement", deadline: null, achieved_on: null }));
    assert.deepEqual(recentMilestones(10).map((m) => m.title), ["New", "Old"]);
  });

  it("exports deadlines inside a range and upcoming open items for the dashboard", () => {
    const open = createOpportunity(values({ title: "Open far", deadline: "2099-06-01", status: "Preparing" }));
    createOpportunity(values({ title: "Closed far", deadline: "2099-06-02", status: "Rejected" }));
    createOpportunity(values({ title: "Past", deadline: "2001-01-01", status: "Interested" }));

    const inRange = getCareerDeadlines("2099-05-01", "2099-07-01");
    assert.deepEqual(inRange.map((d) => d.title), ["Open far", "Closed far"]);
    assert.equal(inRange[0].href, `/career/${open}`);
    assert.deepEqual(getCareerDeadlines("2099-07-01", "2099-05-01"), []);
    assert.deepEqual(getCareerDeadlines("not-a-date", "2099-07-01"), []);

    const upcoming = getUpcomingOpportunities(10);
    assert.deepEqual(upcoming.map((u) => u.title), ["Open far"]);
    assert.ok(upcoming[0].daysLeft > 0);
  });

  it("reads list params from a URL and drops anything off the allowlists", () => {
    const parsed = parseCareerParams({
      kind: "Hackathon",
      status: "'; DROP TABLE x; --",
      window: "next7",
      view: "board",
      page: "3",
    });
    assert.equal(parsed.filters.kind, "Hackathon");
    assert.equal(parsed.filters.status, null);
    assert.equal(parsed.filters.window, "next7");
    assert.equal(parsed.view, "board");
    assert.equal(parsed.page, 3);

    const junk = parseCareerParams({ kind: "Nope", window: "forever", page: "-4" });
    assert.equal(junk.filters.kind, null);
    assert.equal(junk.filters.window, "all");
    assert.equal(junk.page, 1);
    assert.equal(careerHref(parsed, { page: 1 }), "/career?view=board&kind=Hackathon&window=next7");
  });

  it("updates an opportunity without touching its history", () => {
    const id = createOpportunity(values());
    assert.equal(updateOpportunity(id, values({ title: "Changed" })), true);
    assert.equal(updateOpportunity(9999, values()), false);
    assert.equal(opportunityHistory(id).length, 1);
    assert.equal(listOpportunities({ kind: null, status: null, window: "all" }, 1, TODAY).rows[0].title, "Changed");
  });
});
