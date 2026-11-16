import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deviceConnectivity, serviceState, VERIFIED_WINDOW_MS } from "./status";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString();

describe("deviceConnectivity (honest status)", () => {
  it("shows Unknown / Not connected when connectivity was never set", () => {
    const status = deviceConnectivity(
      { connectivity: "Unknown", verified_at: null, verified_by: null },
      NOW,
    );
    assert.equal(status.state, "Unknown");
    assert.equal(status.label, "Unknown");
    assert.equal(status.detail, "Not connected");
  });

  it("never shows Online without a verification stamp, even when the claim says Online", () => {
    const status = deviceConnectivity(
      { connectivity: "Online", verified_at: null, verified_by: null },
      NOW,
    );
    assert.equal(status.state, "Unknown");
  });

  it("shows a manual Online with a manual label, with no time limit", () => {
    const status = deviceConnectivity(
      { connectivity: "Online", verified_at: hoursAgo(24 * 90), verified_by: "manual" },
      NOW,
    );
    assert.equal(status.state, "Online");
    assert.equal(status.source, "manual");
    assert.equal(status.label, "Online (manual)");
  });

  it("shows an automatic check only while it is inside 24 hours", () => {
    const fresh = deviceConnectivity(
      { connectivity: "Offline", verified_at: hoursAgo(23), verified_by: "check" },
      NOW,
    );
    assert.equal(fresh.state, "Offline");
    assert.equal(fresh.source, "check");

    const stale = deviceConnectivity(
      { connectivity: "Offline", verified_at: hoursAgo(25), verified_by: "check" },
      NOW,
    );
    assert.equal(stale.state, "Unknown");
  });

  it("treats a timestamp in the future as a clock error, not evidence", () => {
    const future = new Date(NOW.getTime() + 3600_000).toISOString();
    const status = deviceConnectivity(
      { connectivity: "Online", verified_at: future, verified_by: "check" },
      NOW,
    );
    assert.equal(status.state, "Unknown");
  });

  it("ignores garbage stamps and unknown claims", () => {
    assert.equal(
      deviceConnectivity({ connectivity: "Online", verified_at: "not a date", verified_by: "manual" }, NOW).state,
      "Unknown",
    );
    assert.equal(
      deviceConnectivity({ connectivity: "Sleeping", verified_at: hoursAgo(1), verified_by: "manual" }, NOW).state,
      "Unknown",
    );
  });
});

describe("serviceState (honest status)", () => {
  it("is Unknown until a check or a manual status exists", () => {
    const state = serviceState({ status: "Up", status_source: null, last_checked_at: null }, NOW);
    assert.equal(state.state, "Unknown");
    assert.equal(state.label, "Unknown");
  });

  it("shows Up from a check inside the window and Down the same way", () => {
    const up = serviceState(
      { status: "Up", status_source: "check", last_checked_at: hoursAgo(1) },
      NOW,
    );
    assert.equal(up.state, "Up");
    assert.equal(up.source, "check");
    const down = serviceState(
      { status: "Down", status_source: "check", last_checked_at: hoursAgo(2) },
      NOW,
    );
    assert.equal(down.state, "Down");
  });

  it("drops an old automatic check back to Unknown", () => {
    const state = serviceState(
      { status: "Up", status_source: "check", last_checked_at: new Date(NOW.getTime() - VERIFIED_WINDOW_MS - 1).toISOString() },
      NOW,
    );
    assert.equal(state.state, "Unknown");
    assert.match(state.detail, /more than 24 hours/);
  });

  it("labels a manual status as manual and keeps it", () => {
    const state = serviceState(
      { status: "Up", status_source: "manual", last_checked_at: hoursAgo(24 * 30) },
      NOW,
    );
    assert.equal(state.state, "Up");
    assert.equal(state.label, "Up (manual)");
  });
});
