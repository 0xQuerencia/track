import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientIpFrom, createLimiter } from "./rate-limit";

function fakeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createLimiter", () => {
  it("stays open until max failures are recorded", () => {
    const limiter = createLimiter({ max: 3, windowMs: 1_000, now: fakeClock().now });
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    assert.deepEqual(limiter.status("a"), { locked: false });
  });

  it("locks at max failures and reports time until the window ends", () => {
    const clock = fakeClock();
    const limiter = createLimiter({ max: 3, windowMs: 1_000, now: clock.now });
    for (let i = 0; i < 3; i++) limiter.recordFailure("a");
    clock.advance(250);
    assert.deepEqual(limiter.status("a"), { locked: true, retryAfterMs: 750 });
  });

  it("unlocks once the window has passed", () => {
    const clock = fakeClock();
    const limiter = createLimiter({ max: 2, windowMs: 1_000, now: clock.now });
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    clock.advance(1_000);
    assert.deepEqual(limiter.status("a"), { locked: false });
  });

  it("starts the window at the first failure, not at each one", () => {
    const clock = fakeClock();
    const limiter = createLimiter({ max: 3, windowMs: 1_000, now: clock.now });
    limiter.recordFailure("a");
    clock.advance(600);
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    assert.deepEqual(limiter.status("a"), { locked: true, retryAfterMs: 400 });
    clock.advance(400);
    assert.deepEqual(limiter.status("a"), { locked: false });
  });

  it("keeps keys independent", () => {
    const limiter = createLimiter({ max: 1, windowMs: 1_000, now: fakeClock().now });
    limiter.recordFailure("a");
    assert.equal(limiter.status("a").locked, true);
    assert.equal(limiter.status("b").locked, false);
  });

  it("clears a key on reset, as after a successful sign-in", () => {
    const limiter = createLimiter({ max: 1, windowMs: 1_000, now: fakeClock().now });
    limiter.recordFailure("a");
    limiter.reset("a");
    assert.equal(limiter.status("a").locked, false);
  });

  it("bounds tracked keys so spoofed keys cannot grow memory without limit", () => {
    const limiter = createLimiter({
      max: 1,
      windowMs: 1_000,
      maxKeys: 2,
      now: fakeClock().now,
    });
    limiter.recordFailure("a");
    limiter.recordFailure("b");
    limiter.recordFailure("c");
    assert.equal(limiter.status("a").locked, false, "oldest key was evicted");
    assert.equal(limiter.status("c").locked, true, "newest key is kept");
  });

  it("drops expired keys before evicting live ones", () => {
    const clock = fakeClock();
    const limiter = createLimiter({
      max: 1,
      windowMs: 1_000,
      maxKeys: 2,
      now: clock.now,
    });
    limiter.recordFailure("old");
    clock.advance(1_000);
    limiter.recordFailure("live");
    limiter.recordFailure("new");
    assert.equal(limiter.status("live").locked, true, "live key survives");
    assert.equal(limiter.status("new").locked, true);
  });

  it("rejects nonsensical options", () => {
    assert.throws(() => createLimiter({ max: 0, windowMs: 1_000 }), RangeError);
    assert.throws(() => createLimiter({ max: 1, windowMs: -1 }), RangeError);
    assert.throws(() => createLimiter({ max: Number.NaN, windowMs: 1 }), RangeError);
  });
});

describe("clientIpFrom", () => {
  it("uses the first hop of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" });
    assert.equal(clientIpFrom(headers), "203.0.113.7");
  });

  it("falls back to 'unknown' when the header is absent or empty", () => {
    assert.equal(clientIpFrom(new Headers()), "unknown");
    assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": " " })), "unknown");
  });
});
