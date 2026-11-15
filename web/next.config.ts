import type { NextConfig } from "next";

const publicUrl = process.env.TRACK_PUBLIC_URL;
const publicIsHttps = publicUrl ? new URL(publicUrl).protocol === "https:" : false;
const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy. Scripts and styles allow 'unsafe-inline' because
 * Next's bootstrap scripts and the animation libraries' inline styles are not
 * nonce-stamped here. A nonce-per-request policy (see docs/SECURITY.md) would
 * need dynamic rendering for every page, so it is left out. 'unsafe-eval' is
 * only added in dev, where React uses eval for server-stack reconstruction.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Only when the public address is HTTPS: HSTS over plain HTTP would lock
  // out a LAN-only deployment.
  ...(publicIsHttps
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const config: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    serverActions: {
      // The public hostname when requests arrive through a forwarding proxy.
      allowedOrigins: publicUrl ? [new URL(publicUrl).host] : [],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
