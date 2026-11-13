/**
 * Signed-cookie session. One shared password (TRACK_PASSWORD) gates the app.
 * The HMAC key is derived from that password, so changing it signs everyone
 * out. Uses Web Crypto only, so it runs in both the proxy and server code.
 */
export const SESSION_COOKIE = "track_session";
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

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

async function signingKey(): Promise<CryptoKey | null> {
  const password = process.env.TRACK_PASSWORD;
  if (!password) return null;
  const seed = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${password}:track-session`),
  );
  return crypto.subtle.importKey(
    "raw",
    seed,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(payload: string): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function createSessionToken(): Promise<string | null> {
  const expires = String(Date.now() + SESSION_DAYS * 86_400_000);
  const signature = await sign(expires);
  return signature ? `${expires}.${signature}` : null;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (!(Number(expires) > Date.now())) return false;
  const expected = await sign(expires);
  return expected !== null && equalConstantTime(signature, expected);
}

export async function passwordMatches(input: string): Promise<boolean> {
  const password = process.env.TRACK_PASSWORD;
  if (!password) return false;
  const [a, b] = await Promise.all(
    [input, password].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)).then(toHex),
    ),
  );
  return equalConstantTime(a, b);
}
