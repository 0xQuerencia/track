/**
 * Fixed-window failure limiter, in memory and per process. Each key gets
 * `max` failures per `windowMs`; once reached, the key is locked until its
 * window ends. Dependency-free so it runs under node:test and in server code.
 */

export type LimiterOptions = {
  /** Failures allowed inside one window before the key is locked. */
  max: number;
  /** Window length in ms. A lock lasts until the window ends. */
  windowMs: number;
  /** Upper bound on tracked keys, so spoofed keys cannot grow memory forever. */
  maxKeys?: number;
  /** Clock override for tests. */
  now?: () => number;
};

export type LimiterStatus =
  | { locked: false }
  | { locked: true; retryAfterMs: number };

export type Limiter = {
  status(key: string): LimiterStatus;
  recordFailure(key: string): void;
  reset(key: string): void;
};

type Entry = { count: number; resetAt: number };

const DEFAULT_MAX_KEYS = 10_000;

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be a positive number`);
}

export function createLimiter(options: LimiterOptions): Limiter {
  assertPositive("max", options.max);
  assertPositive("windowMs", options.windowMs);
  const { max, windowMs } = options;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  assertPositive("maxKeys", maxKeys);
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  /** Returns the entry only while its window is still open. */
  function live(key: string, at: number): Entry | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.resetAt <= at) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Makes room for one new key: drop expired keys, then the oldest ones. */
  function makeRoom(at: number): void {
    if (entries.size < maxKeys) return;
    for (const [key, entry] of entries) {
      if (entry.resetAt <= at) entries.delete(key);
    }
    for (const oldest of entries.keys()) {
      if (entries.size < maxKeys) break;
      entries.delete(oldest);
    }
  }

  return {
    status(key) {
      const at = now();
      const entry = live(key, at);
      if (entry && entry.count >= max)
        return { locked: true, retryAfterMs: entry.resetAt - at };
      return { locked: false };
    },
    recordFailure(key) {
      const at = now();
      const entry = live(key, at);
      if (entry) {
        entries.set(key, { count: entry.count + 1, resetAt: entry.resetAt });
        return;
      }
      makeRoom(at);
      entries.set(key, { count: 1, resetAt: at + windowMs });
    },
    reset(key) {
      entries.delete(key);
    },
  };
}

/**
 * Best-effort client address for keying limits. Uses the first hop of
 * x-forwarded-for, which the reverse proxy must set (and overwrite) for it
 * to mean anything. Falls back to "unknown" when the header is absent.
 */
export function clientIpFrom(headers: Pick<Headers, "get">): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}
