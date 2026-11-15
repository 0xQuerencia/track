import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

/*
 * SSRF guard for user-entered service URLs. A URL is checked only after:
 *   1. it parses, uses http or https, carries no credentials, and names a
 *      host that is not a local-only name;
 *   2. every address its host resolves to is public (not loopback, private,
 *      link-local, metadata, multicast or reserved).
 * The resolved address is then pinned for the actual request, so a second DNS
 * answer cannot swap in a private address between check and connect.
 */

export const MAX_URL_LENGTH = 2048;

export type UrlParse = { ok: true; url: URL } | { ok: false; reason: string };

export type ResolveResult =
  | { ok: true; address: string; family: 4 | 6 }
  | { ok: false; blocked: boolean; reason: string };

/** A DNS lookup that returns every address (matches dns.promises.lookup with all:true). */
export type LookupAll = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<{ address: string; family: number }[]>;

/* ---------- IPv4 ---------- */

/** CIDR blocks that must never be reached by a server-side check. */
const BLOCKED_IPV4: readonly { base: string; bits: number }[] = [
  { base: "0.0.0.0", bits: 8 }, // "this network"
  { base: "10.0.0.0", bits: 8 }, // private
  { base: "100.64.0.0", bits: 10 }, // carrier-grade NAT
  { base: "127.0.0.0", bits: 8 }, // loopback
  { base: "169.254.0.0", bits: 16 }, // link-local, includes cloud metadata 169.254.169.254
  { base: "172.16.0.0", bits: 12 }, // private
  { base: "192.0.0.0", bits: 24 }, // IETF protocol assignments
  { base: "192.168.0.0", bits: 16 }, // private
  { base: "198.18.0.0", bits: 15 }, // benchmarking
  { base: "224.0.0.0", bits: 4 }, // multicast
  { base: "240.0.0.0", bits: 4 }, // reserved, includes broadcast
];

export function ipv4ToInt(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inBlockedIpv4(value: number): boolean {
  return BLOCKED_IPV4.some(({ base, bits }) => {
    const baseValue = ipv4ToInt(base) ?? 0;
    const size = 2 ** (32 - bits);
    const start = Math.floor(baseValue / size) * size;
    return value >= start && value < start + size;
  });
}

/** True when the IPv4 address is one a server-side check must not reach. */
export function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true;
  return inBlockedIpv4(value);
}

/* ---------- IPv6 ---------- */

/** Expands an IPv6 literal (with optional zone id and embedded IPv4) into eight 16-bit groups. */
export function parseIpv6(address: string): number[] | null {
  let text = address.split("%")[0];
  if (!text) return null;
  // Replace an embedded dotted IPv4 tail with two hex groups.
  const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const value = ipv4ToInt(tail[1]);
    if (value === null) return null;
    const high = Math.floor(value / 65536).toString(16);
    const low = (value % 65536).toString(16);
    text = `${text.slice(0, text.length - tail[1].length)}${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : head.length !== 8) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const values = groups.map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : NaN));
  return values.some((value) => Number.isNaN(value)) ? null : values;
}

function ipv4FromGroups(high: number, low: number): string {
  return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
}

/** True when the IPv6 address is one a server-side check must not reach. */
export function isBlockedIpv6(address: string): boolean {
  const g = parseIpv6(address);
  if (!g) return true;
  const allZero = (from: number, to: number) => g.slice(from, to).every((v) => v === 0);

  if (allZero(0, 8)) return true; // ::  unspecified
  if (allZero(0, 7) && g[7] === 1) return true; // ::1 loopback
  // IPv4-mapped ::ffff:a.b.c.d: judge the embedded IPv4 address.
  if (allZero(0, 5) && g[5] === 0xffff) return isBlockedIpv4(ipv4FromGroups(g[6], g[7]));
  // IPv4-compatible (deprecated ::a.b.c.d): never a public target.
  if (allZero(0, 6)) return true;
  // NAT64 64:ff9b::/96 embeds an IPv4 address in the last 32 bits.
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) return isBlockedIpv4(ipv4FromGroups(g[6], g[7]));
  // 6to4 2002::/16 embeds an IPv4 address in groups 1 and 2.
  if (g[0] === 0x2002) return isBlockedIpv4(ipv4FromGroups(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7 (includes fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation 2001:db8::/32
  return false;
}

/** True when an IP literal (v4 or v6) must not be contacted. Unparseable input is blocked. */
export function isBlockedAddress(address: string): boolean {
  if (net.isIPv4(address)) return isBlockedIpv4(address);
  if (net.isIPv6(address)) return isBlockedIpv6(address);
  return true;
}

/* ---------- URLs ---------- */

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal", ".home.arpa"];

/** Host name without IPv6 brackets, lower-cased. */
export function hostOf(url: URL): string {
  const host = url.hostname.toLowerCase();
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Parses and screens a user-entered URL before any network activity. */
export function parseCheckableUrl(raw: unknown): UrlParse {
  if (typeof raw !== "string") return { ok: false, reason: "The URL is missing." };
  const text = raw.trim();
  if (!text || text.length > MAX_URL_LENGTH) return { ok: false, reason: "The URL is missing or too long." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "The URL is not valid." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "Only http and https URLs can be checked." };
  if (url.username || url.password)
    return { ok: false, reason: "URLs with a username or password are not checked." };
  const host = hostOf(url);
  if (!host) return { ok: false, reason: "The URL has no host." };
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    return { ok: false, reason: "Local host names are not checked." };
  if (net.isIP(host) && isBlockedAddress(host))
    return { ok: false, reason: "This address is private or local and is not checked." };
  return { ok: true, url };
}

/**
 * Resolves the host and picks the address to connect to. Every resolved
 * address must be public; one private answer blocks the whole host.
 */
export async function resolveCheckTarget(
  url: URL,
  lookup: LookupAll = dnsLookup as unknown as LookupAll,
): Promise<ResolveResult> {
  const host = hostOf(url);
  if (net.isIP(host)) {
    if (isBlockedAddress(host))
      return { ok: false, blocked: true, reason: "This address is private or local and is not checked." };
    return { ok: true, address: host, family: net.isIPv6(host) ? 6 : 4 };
  }
  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, blocked: false, reason: "The host name could not be resolved." };
  }
  if (answers.length === 0)
    return { ok: false, blocked: false, reason: "The host name could not be resolved." };
  if (answers.some((answer) => isBlockedAddress(answer.address)))
    return { ok: false, blocked: true, reason: "The host resolves to a private or local address and is not checked." };
  const first = answers[0];
  return { ok: true, address: first.address, family: first.family === 6 ? 6 : 4 };
}
