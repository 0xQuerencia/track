/**
 * Signed-cookie session for the single shared password. Uses Web Crypto only,
 * so it runs in both the proxy and server code.
 *
 * Token formats:
 *   v2  "v2.<epoch>.<expiresMs>.<hex HMAC>"  signed over "v2.<epoch>.<expiresMs>"
 *   v1  "<expiresMs>.<hex HMAC>"             legacy; implicit epoch 0
 *
 * Keys and env (see docs/SECURITY.md for the rotation procedure):
 *   TRACK_PASSWORD        always required; no token verifies without it
 *   TRACK_SESSION_SECRET  optional, >= 32 chars; when set, signs new v2 tokens
 *   TRACK_SESSION_EPOCH   integer, default 0; bumping it signs everyone out
 *   TRACK_LEGACY_SESSIONS "0" disables the password-derived legacy key; the
 *                         default keeps sessions issued before the secret existed
 */

export const SESSION_COOKIE = "track_session";
export const SESSION_DAYS = 30;
export const MIN_SESSION_SECRET_LENGTH = 32;

const SESSION_MS = SESSION_DAYS * 86_400_000;
const encoder = new TextEncoder();

/** Env subset this module reads. Pass process.env, or a plain object in tests. */
export type SessionEnv = Record<string, string | undefined>;

export type SessionConfig = {
  password: string;
  /** Signing secret for v2 tokens, or null to sign with the legacy key. */
  secret: string | null;
  epoch: number;
  acceptLegacy: boolean;
};

export type SessionConfigResult =
  | { ok: true; config: SessionConfig }
  | { ok: false; problem: string };

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Validates the session env. Any problem means no session works (fail closed). */
export function readSessionConfig(env: SessionEnv = process.env): SessionConfigResult {
  const password = env.TRACK_PASSWORD;
  if (!password) return { ok: false, problem: "TRACK_PASSWORD is not set." };

  const secret = env.TRACK_SESSION_SECRET || null;
  if (secret !== null && secret.length < MIN_SESSION_SECRET_LENGTH)
    return {
      ok: false,
      problem: `TRACK_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`,
    };

  const epochRaw = env.TRACK_SESSION_EPOCH?.trim() || "0";
  if (!/^\d{1,9}$/.test(epochRaw))
    return { ok: false, problem: "TRACK_SESSION_EPOCH must be a non-negative integer." };

  return {
    ok: true,
    config: {
      password,
      secret,
      epoch: Number(epochRaw),
      acceptLegacy: env.TRACK_LEGACY_SESSIONS !== "0",
    },
  };
}

async function importHmacKey(material: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** The password-derived key every pre-v2 cookie was signed with. Kept byte-identical. */
async function legacyKey(password: string): Promise<CryptoKey> {
  const seed = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${password}:track-session`),
  );
  return importHmacKey(seed);
}

async function sign(key: CryptoKey, payload: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

async function signingKey(config: SessionConfig): Promise<CryptoKey> {
  return config.secret
    ? importHmacKey(encoder.encode(config.secret))
    : legacyKey(config.password);
}

/** Keys a token of the given format may be verified against. */
async function verificationKeys(
  config: SessionConfig,
  legacyFormat: boolean,
): Promise<CryptoKey[]> {
  if (legacyFormat) {
    // v1 tokens predate epochs, so they only count while the epoch is 0.
    if (!config.acceptLegacy || config.epoch !== 0) return [];
    return [await legacyKey(config.password)];
  }
  const keys = [await signingKey(config)];
  if (config.secret && config.acceptLegacy) keys.push(await legacyKey(config.password));
  return keys;
}

type ParsedToken = {
  legacyFormat: boolean;
  /** Epoch as written in the token ("0" for v1, which predates epochs). */
  epoch: string;
  expires: string;
  payload: string;
  signature: string;
};

function parseToken(token: string): ParsedToken | null {
  const parts = token.split(".");
  if (parts.length === 2) {
    const [expires, signature] = parts;
    return { legacyFormat: true, epoch: "0", expires, payload: expires, signature };
  }
  if (parts.length === 4 && parts[0] === "v2") {
    const [, epoch, expires, signature] = parts;
    return {
      legacyFormat: false,
      epoch,
      expires,
      payload: `v2.${epoch}.${expires}`,
      signature,
    };
  }
  return null;
}

export async function createSessionToken(
  env: SessionEnv = process.env,
  now: number = Date.now(),
): Promise<string | null> {
  const result = readSessionConfig(env);
  if (!result.ok) return null;
  const { config } = result;
  const payload = `v2.${config.epoch}.${now + SESSION_MS}`;
  return `${payload}.${await sign(await signingKey(config), payload)}`;
}

export async function verifySessionToken(
  token: string,
  env: SessionEnv = process.env,
  now: number = Date.now(),
): Promise<boolean> {
  const result = readSessionConfig(env);
  if (!result.ok) return false;
  const { config } = result;

  const parsed = parseToken(token);
  if (!parsed) return false;
  if (!/^\d{1,15}$/.test(parsed.expires)) return false;
  if (!/^[0-9a-f]{64}$/.test(parsed.signature)) return false;
  if (!(Number(parsed.expires) > now)) return false;
  if (!/^\d{1,9}$/.test(parsed.epoch) || Number(parsed.epoch) !== config.epoch)
    return false;

  for (const key of await verificationKeys(config, parsed.legacyFormat)) {
    const expected = await sign(key, parsed.payload);
    if (equalConstantTime(parsed.signature, expected)) return true;
  }
  return false;
}

export async function passwordMatches(
  input: string,
  env: SessionEnv = process.env,
): Promise<boolean> {
  const password = env.TRACK_PASSWORD;
  if (!password) return false;
  const [a, b] = await Promise.all(
    [input, password].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)).then(toHex),
    ),
  );
  return equalConstantTime(a, b);
}
