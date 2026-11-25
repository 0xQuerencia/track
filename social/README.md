# Track Social (disabled-by-default development service)

This is a separate Node 24+ process, SQLite file and API, not a route in the personal Track server. It must not run with the owner password, personal DB mount, AI provider keys or personal service credentials. Use a separate OS user/container and a dedicated private 0700 directory. No data is copied from the personal OS, and no sharing is implicit.

Local development: create a private dedicated directory and set TRACK_SOCIAL_ENABLED=1, TRACK_SOCIAL_DATA=/absolute/private/social-directory, and optionally TRACK_SOCIAL_PORT=8788, then run npm --prefix social start. The process binds only to 127.0.0.1. The development API supports account enrollment, login, logout and profile inspection. Tests: npm --prefix social test.

Do not expose this development service publicly. Production requires separate TLS origin, authenticated account enrollment, membership authorization, rate-limit review (a reverse proxy shares a source IP), backup/restore, moderation, and security tests. Browser cross-origin requests are rejected until a deliberately designed client boundary is added.

## Invite-only accounts
With the same dedicated environment, run `node social/src/invite.mjs` on the service host. Share the one-time invite privately (default expiry 24 hours). POST /v1/auth/register with JSON invite, handle, displayName, password. POST /v1/auth/login with handle/password. Both return a social bearer token once; store it in a secure client store. GET /v1/me and POST /v1/auth/logout require Authorization: Bearer. Passwords use scrypt with random salts; invites and sessions are hashed and expire. Owner Track cookies and tokens do not authenticate here. Password recovery and account deletion are not yet implemented; do not expose the service publicly.
