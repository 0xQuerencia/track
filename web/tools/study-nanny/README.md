# Import completed Study Nanny sessions

Track and Study Nanny run independently. This local connector reads explicitly
selected completed sessions from Nanny's HTTP loopback API. Track does not connect back
to the laptop, start capture, or receive raw screenshots, window names, subject
or goal text, app IDs or browser URLs. The timestamps and duration totals are the
entire shared record, as previewed below. Review them before sending.

1. On the laptop running Study Nanny, finish sessions and find their IDs using
   `nanny sessions`. Set `NANNY_READ_TOKEN_FILE` to its profile's `read.token`
   (usually under `$XDG_DATA_HOME/study-nanny` or `~/.local/share/study-nanny`).
   Keep credentials in permission-restricted files. Don't use the control token.
2. In Track **Settings → Integration tokens**, create a token with only
   `study-nanny:write`. Save it in a file restricted to your account.
   Set `TRACK_NANNY_TOKEN_FILE` to that file. Set `TRACK_ORIGIN` to your trusted
   Track HTTPS origin (without a path). Local testing can use HTTP loopback.
3. From Track's `web` directory, preview up to 10 explicitly selected IDs:
   `node tools/study-nanny/sync.mjs 42 43`. The command reads bounded pages
   from Nanny's redacted `/v1/integrations/track/v1/sessions` handoff, then
   prints a local summary-only preview. It accepts only schema version 1,
   validates timestamps and totals, and stops after at most 10 pages and 5 MiB
   of response data (512 KiB per page). If any selected ID is missing, a page
   is malformed, or a session is active (409), the whole preview fails closed.
   Authorization failures (401) also stop immediately. Inspect the preview. To transmit exactly those previewed
   summaries, rerun `node tools/study-nanny/sync.mjs 42 43 --send`. There is no
   automatic discovery or background sync. Each row reports `sent` or `failed`;
   retry failed IDs by previewing them again, then explicitly sending again.
4. Find it on **Focus → Study Nanny**. Timers and measured focus are separate,
   so importing does not inflate the legacy focus total.

Retrying the same session with the same token is a no-op, even after a network
failure. A failed authorization or scope check is reported for that session;
correct the token or scope, preview again, and explicitly resend. Use one dedicated token per Nanny profile. For this first version, do
not reimport earlier sessions after rotating tokens or resetting a Nanny profile;
a new token is a new namespace. This command does not install background services.
Unverified includes clock gaps, uncertain evidence and independent rounding,
so it is not automatically counted as study or distraction.

## Synthetic localhost smoke

The connector's synthetic fetch suite runs without binding a port:

```sh
cd web
node --test tools/study-nanny/sync.test.mjs
```

For the end-to-end check, build the sibling Study Nanny checkout first with
`cargo build --workspace --locked` (with the redacted v1 handoff), then run this
from Track's `web` directory:

```sh
NANNY_TEST_BIN_DIR=/absolute/path/to/study-nanny/target/debug \
  node --import tsx tools/study-nanny/interop-smoke.mjs
```

It uses a fresh temporary Nanny profile, an in-memory Track database, and
loopback only. It checks that an active session cannot be read, preview makes
no Track request, explicit send reaches the authenticated Track route, and
retry is idempotent without affecting Track's own timer logs. No keys or
real profiles are needed.
