# Read-only focus collector API

`GET /api/integrations/focus` accepts a dedicated bearer token with `focus:read`. If a browser already uses an activity credential, create a new token with both `activity:write` and `focus:read` only if you explicitly want automatic focus-aware blocking. Revoke the previous token if replacing it. Never use an owner password.

The no-store response contains only `ok`, `serverNow`, `active`, `phase` (none, waiting, focus, short_break, long_break, complete), `paused`, and `remainingMs`. It does not expose session ID, objective, personal records or history. It cannot change a timer. A collector must treat network errors or expired data as unknown, stop automatic blocking when the timer is paused or in a break, and always offer an immediate local escape.
