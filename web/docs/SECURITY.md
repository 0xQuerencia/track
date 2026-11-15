# Track web security

## Environment variables

| Variable | Purpose |
|---|---|
| `TRACK_PASSWORD` | Required. The shared password. Unset means sign-in is disabled and no session verifies (fail closed). |
| `TRACK_SESSION_SECRET` | Optional, at least 32 characters. Signs new session cookies. Changing the password no longer signs everyone out. If it is set but too short, sign-in is disabled. |
| `TRACK_SESSION_EPOCH` | Integer, default `0`. Every session records the epoch it was issued under. Bump it to sign every browser out. |
| `TRACK_LEGACY_SESSIONS` | Set to `0` to stop accepting sessions issued before `TRACK_SESSION_SECRET` existed. Default: accepted. |
| `TRACK_API_TOKEN` | Bearer token for `/api/v1/*`, at least 24 characters. Unset or short means every API call gets 503. |
| `TRACK_PUBLIC_URL` | Public base URL. An `https://` value turns on the `Secure` cookie flag and HSTS. |
| `TRACK_COOKIE_SECURE` | `1` forces the `Secure` cookie flag. Otherwise it is inferred from HTTPS (`TRACK_PUBLIC_URL` or `X-Forwarded-Proto`). |

## Sessions

- Cookie `track_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, 30 days, `Secure` on HTTPS.
  `Lax` is deliberate. `Strict` would drop the cookie on links from other sites, so a signed-in user would be sent to `/login`. Cross-site POSTs are still blocked, and server actions and the origin check cover the rest.
- Token formats:
  - `v2.<epoch>.<expiresMs>.<hmac>`: new tokens. Signed with `TRACK_SESSION_SECRET` if set, otherwise with the password-derived key.
  - `<expiresMs>.<hmac>`: legacy tokens from before this change. Implicit epoch `0`, signed with the password-derived key.
- Verification also needs `TRACK_PASSWORD` to be set. Epoch and expiry are inside the signature. Comparison is constant-time.

## Transition and rotation

1. **Adopt the secret.** Set `TRACK_SESSION_SECRET` (at least 32 random characters) and restart. Existing browsers keep working on their legacy cookie, which expires within 30 days.
2. **Retire legacy sessions.** After 30 days (or sooner, if you do not mind a re-login), set `TRACK_LEGACY_SESSIONS=0` and restart. Legacy cookies then fail.
3. **Sign everyone out** (suspected leak or device loss): increase `TRACK_SESSION_EPOCH` by one and restart. You can also change `TRACK_SESSION_SECRET`, but that signs everyone out too and is the stronger choice for a leaked secret.
4. **Rotate the password:** change `TRACK_PASSWORD`. Sessions signed with the secret stay valid. Legacy cookies stop working.
5. **Rotate the API token:** change `TRACK_API_TOKEN` and update the phone app.

## Sign-in rate limit

- Per client IP: 5 failed passwords in 15 minutes. The lock lasts until the window ends and applies even to the correct password.
- Across all clients: 30 failures in 15 minutes, to stop a flood of spoofed `X-Forwarded-For` values from evading the per-IP limit.
- Each failed or locked attempt waits 600 ms before answering.
- State is in memory per process. Restarting the server clears it. It is not shared across instances.
- The client IP is the first hop of `X-Forwarded-For`. The reverse proxy must overwrite that header. If clients can set it, the per-IP limit is weak and the global limit is what holds.

## Origin checks (CSRF)

- Server actions `loginAction` and `logoutAction` call `verifyOriginHeaders`. A missing or foreign `Origin` is refused.
- For any new route handler that accepts a POST authenticated by the session cookie, call `verifySameOrigin(request)` from `src/lib/security/origin.ts` and reject on failure.
- Bearer-token routes (`/api/v1/*`) do not need this. The browser never attaches that header on its own.

## Response headers (`next.config.ts`)

- `Content-Security-Policy`: `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `img-src 'self' data: blob:`, `font-src 'self' data:`.
  - `script-src` and `style-src` allow `'unsafe-inline'`. Next's bootstrap scripts are not nonce-stamped. A per-request nonce would require dynamic rendering for every page. It is a known gap, not a solved one.
  - Dev only: `'unsafe-eval'` for React's debugging, and `ws:`/`wss:` for hot reload.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`, only when `TRACK_PUBLIC_URL` is `https://`.

## Integration tokens (not yet wired)

`src/lib/security/integration-tokens.ts` provides scoped tokens (`trk_<base64url 32 bytes>`). Only a SHA-256 hash is stored. Scopes: `sessions:write`, `projects:write`, `metadata:write`. Apply `INTEGRATION_TOKENS_SQL` through the migration layer, then use `createToken`, `verifyToken` and `revokeToken`. No route uses them yet.

## Logging

Use `redact()` / `redactText()` from `src/lib/security/redact.ts` before logging anything that might contain a bearer token, cookie, password or session. Existing logs were reviewed: they record only operation names and DB error objects, never tokens or passwords.
