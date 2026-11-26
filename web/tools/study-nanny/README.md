# Import one Study Nanny session

Track and Study Nanny run independently. This local connector reads only one
completed session from Nanny's HTTP loopback API. Track does not connect back
to the laptop, start capture, or receive raw screenshots, window names, subject
or goal text, app IDs or browser URLs. The timestamps and duration totals are the
entire shared record, as previewed below. Review them before sending.

1. On the laptop running Study Nanny, finish a session and find its ID using
   `nanny sessions`. Set `NANNY_READ_TOKEN_FILE` to its profile's `read.token`
   (usually under `$XDG_DATA_HOME/study-nanny` or `~/.local/share/study-nanny`).
   Keep credentials in permission-restricted files. Don't use the control token.
2. In Track **Settings → Integration tokens**, create a token with only
   `study-nanny:write`. Save it in a file restricted to your account.
   Set `TRACK_NANNY_TOKEN_FILE` to that file. Set `TRACK_ORIGIN` to your trusted
   Track HTTPS origin (without a path). Local testing can use HTTP loopback.
3. From Track's `web` directory, preview then import:
   `node tools/study-nanny/sync.mjs 42` and then
   `node tools/study-nanny/sync.mjs 42 --send`. Replace 42 with your session ID.
4. Find it on **Focus → Study Nanny**. Timers and measured focus are separate,
   so importing does not inflate the legacy focus total.

Retrying the same session with the same token is a no-op, even after a network
failure. Use one dedicated token per Nanny profile. For this first version, do
not reimport earlier sessions after rotating tokens or resetting a Nanny profile;
a new token is a new namespace. This command does not install background services.
Unverified includes clock gaps, uncertain evidence and independent rounding,
so it is not automatically counted as study or distraction.
