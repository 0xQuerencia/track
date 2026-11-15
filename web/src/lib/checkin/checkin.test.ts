import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setConsent } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { applyCheckin, latestWeight, proposeCheckin, sleepHours, todayCheckinDone } from "./index";

beforeEach(() => installTestDb());
afterEach(() => closeTestDb());

const reply = (data: unknown) => async () => ({ ok: true as const, data, model: "m", usage: { promptTokens: 1, completionTokens: 1 } });

describe("sleepHours", () => {
  it("crosses midnight", () => assert.equal(sleepHours("21:00", "07:00"), 10));
  it("rounds to quarter hours", () => assert.equal(sleepHours("23:10", "06:40"), 7.5));
});

describe("check-in", () => {
  it("refuses without consent and calls nothing", async () => {
    let called = false;
    const result = await proposeCheckin(getDb(), "slept 9pm to 7am", "2026-11-16", async () => { called = true; throw new Error("no"); });
    assert.equal(result.ok, false);
    assert.equal(called, false);
  });

  it("proposes, then applies sleep, energy and weight", async () => {
    const db = getDb();
    setConsent(db, "checkin", true);
    const proposed = await proposeCheckin(db, "slept 9 PM to 7 AM, weight 72.5, energy 4", "2026-11-16", reply({
      bedtime: "21:00", wake_time: "07:00", energy: 4, weight_kg: 72.5,
    }) as never);
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    assert.equal(db.prepare("SELECT COUNT(*) n FROM health_logs").get()!.n, 0, "nothing written before apply");
    const applied = applyCheckin(db, proposed.id);
    assert.equal(applied.ok, true);
    const log = db.prepare("SELECT sleep_hours, energy, notes FROM health_logs WHERE date = '2026-11-16'").get() as { sleep_hours: number; energy: number; notes: string };
    assert.equal(log.sleep_hours, 10);
    assert.equal(log.energy, 4);
    assert.match(log.notes, /21:00 to 07:00/);
    assert.equal(latestWeight(db)?.weight_kg, 72.5);
    assert.equal(todayCheckinDone(db, "2026-11-16"), true);
    assert.equal(applyCheckin(db, proposed.id).ok, false, "cannot apply twice");
  });

  it("updates today's existing health log instead of duplicating it", async () => {
    const db = getDb();
    setConsent(db, "checkin", true);
    db.prepare("INSERT INTO health_logs (date, workout) VALUES ('2026-11-16', 'Run')").run();
    const proposed = await proposeCheckin(db, "energy 3", "2026-11-16", reply({ energy: 3 }) as never);
    if (proposed.ok) applyCheckin(db, proposed.id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM health_logs WHERE date = '2026-11-16'").get()!.n, 1);
  });

  it("rejects an all-null reply and invalid values", async () => {
    const db = getDb();
    setConsent(db, "checkin", true);
    const empty = await proposeCheckin(db, "hello", "2026-11-16", reply({}) as never);
    assert.equal(empty.ok, false);
  });
});
