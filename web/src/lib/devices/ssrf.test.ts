import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockedAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  parseCheckableUrl,
  parseIpv6,
  resolveCheckTarget,
  type LookupAll,
} from "./ssrf";

describe("isBlockedIpv4", () => {
  it("blocks loopback, private, link-local and metadata addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
      "192.0.0.8",
      "198.18.0.1",
    ])
      assert.equal(isBlockedIpv4(ip), true, `${ip} should be blocked`);
  });

  it("allows public addresses, including the edges of the private ranges", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.15.255.255",
      "172.32.0.1",
      "100.63.255.255",
      "169.253.255.255",
    ])
      assert.equal(isBlockedIpv4(ip), false, `${ip} should be allowed`);
  });

  it("blocks anything that is not a dotted IPv4 address", () => {
    assert.equal(isBlockedIpv4("256.1.1.1"), true);
    assert.equal(isBlockedIpv4("1.2.3"), true);
    assert.equal(isBlockedIpv4("abc"), true);
  });
});

describe("parseIpv6", () => {
  it("expands compressed forms into eight groups", () => {
    assert.deepEqual(parseIpv6("2001:db8::1"), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(parseIpv6("::"), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(parseIpv6("::ffff:10.0.0.1"), [0, 0, 0, 0, 0, 0xffff, 0x0a00, 0x0001]);
    assert.deepEqual(parseIpv6("fe80::1%eth0"), [0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("rejects malformed input", () => {
    assert.equal(parseIpv6("1::2::3"), null);
    assert.equal(parseIpv6("12345::1"), null);
    assert.equal(parseIpv6("1:2:3"), null);
    assert.equal(parseIpv6("zzzz::1"), null);
  });
});

describe("isBlockedIpv6", () => {
  it("blocks loopback, unspecified, unique-local and link-local addresses", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd00:ec2::254", "fe80::1", "fec0::1", "ff02::1", "2001:db8::1"])
      assert.equal(isBlockedIpv6(ip), true, `${ip} should be blocked`);
  });

  it("judges IPv4 addresses embedded in IPv6 forms by the IPv4 address", () => {
    assert.equal(isBlockedIpv6("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedIpv6("::ffff:10.0.0.1"), true);
    assert.equal(isBlockedIpv6("::ffff:169.254.169.254"), true);
    assert.equal(isBlockedIpv6("::ffff:8.8.8.8"), false);
    assert.equal(isBlockedIpv6("64:ff9b::7f00:1"), true);
    assert.equal(isBlockedIpv6("2002:7f00:1::"), true);
  });

  it("allows public IPv6 addresses", () => {
    assert.equal(isBlockedIpv6("2606:4700:4700::1111"), false);
    assert.equal(isBlockedIpv6("2a00:1450:4001::200e"), false);
  });

  it("blocks unparseable addresses", () => {
    assert.equal(isBlockedIpv6("not-an-address"), true);
  });
});

describe("isBlockedAddress", () => {
  it("dispatches by family and blocks anything unrecognised", () => {
    assert.equal(isBlockedAddress("127.0.0.1"), true);
    assert.equal(isBlockedAddress("::1"), true);
    assert.equal(isBlockedAddress("8.8.8.8"), false);
    assert.equal(isBlockedAddress("hostname.example"), true);
  });
});

describe("parseCheckableUrl", () => {
  it("accepts public http and https URLs", () => {
    const ok = parseCheckableUrl("https://example.com/status?x=1");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.url.hostname, "example.com");
    assert.equal(parseCheckableUrl("http://example.org").ok, true);
  });

  it("rejects non-http schemes", () => {
    for (const raw of ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "gopher://example.com"])
      assert.equal(parseCheckableUrl(raw).ok, false, raw);
  });

  it("rejects credentials in the URL", () => {
    assert.equal(parseCheckableUrl("https://user:pass@example.com").ok, false);
    assert.equal(parseCheckableUrl("https://user@example.com").ok, false);
  });

  it("rejects local host names and literal private addresses", () => {
    for (const raw of [
      "http://localhost/",
      "http://localhost:3000/",
      "http://app.localhost/",
      "http://printer.local/",
      "http://db.internal/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://[fd00:ec2::254]/",
      "http://0x7f.0.0.1/",
    ])
      assert.equal(parseCheckableUrl(raw).ok, false, raw);
  });

  it("rejects non-strings, empty and oversized input", () => {
    assert.equal(parseCheckableUrl(42).ok, false);
    assert.equal(parseCheckableUrl("   ").ok, false);
    assert.equal(parseCheckableUrl(`https://example.com/${"a".repeat(2100)}`).ok, false);
  });
});

describe("resolveCheckTarget", () => {
  const url = (text: string) => {
    const parsed = parseCheckableUrl(text);
    if (!parsed.ok) throw new Error("bad test url");
    return parsed.url;
  };
  const answers =
    (list: { address: string; family: number }[]): LookupAll =>
    async () =>
      list;

  it("pins the first public address", async () => {
    const result = await resolveCheckTarget(
      url("https://example.com"),
      answers([{ address: "93.184.216.34", family: 4 }]),
    );
    assert.deepEqual(result, { ok: true, address: "93.184.216.34", family: 4 });
  });

  it("blocks the whole host when any answer is private", async () => {
    const result = await resolveCheckTarget(
      url("https://example.com"),
      answers([
        { address: "93.184.216.34", family: 4 },
        { address: "10.1.2.3", family: 4 },
      ]),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.blocked, true);
  });

  it("blocks a host that resolves to loopback or metadata", async () => {
    const result = await resolveCheckTarget(
      url("https://attacker.example"),
      answers([{ address: "169.254.169.254", family: 4 }]),
    );
    assert.equal(result.ok, false);
  });

  it("reports an unresolvable name without calling it blocked", async () => {
    const failing: LookupAll = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await resolveCheckTarget(url("https://nope.example"), failing);
    assert.deepEqual(result, { ok: false, blocked: false, reason: "The host name could not be resolved." });
    const empty = await resolveCheckTarget(url("https://nope.example"), answers([]));
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.blocked, false);
  });

  it("never performs a lookup for an IP literal", async () => {
    let called = false;
    const spy: LookupAll = async () => {
      called = true;
      return [];
    };
    const ok = await resolveCheckTarget(url("http://8.8.8.8/"), spy);
    assert.deepEqual(ok, { ok: true, address: "8.8.8.8", family: 4 });
    // Built directly: parseCheckableUrl would refuse this earlier, and this test covers the resolver's own check.
    const blocked = await resolveCheckTarget(new URL("http://192.168.0.1/"), spy);
    assert.equal(blocked.ok, false);
    assert.equal(called, false);
  });
});
