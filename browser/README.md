# Track Pulse Chromium prototype

Load this directory with developer mode / Load unpacked in Chromium. Create a dedicated activity:write integration token in Track Settings and pair using the server's HTTPS origin. Tracking is opt-in and sends only coarse observed intervals, never URLs, page titles, history or page content. The extension samples focused normal windows and idle state; intervals around transitions and worker suspension can be undercounted. It does not claim precise attention measurement. No incognito collection. Pause or disconnect from the popup; disconnect clears the local queue and credentials, but not records already sent to Track. Revoke the token separately on Track. Browser compatibility and end-to-end pairing require manual smoke testing. This is an initial collector; optional local category rules and exclusions require explicit tab permission; no raw domain is uploaded. Blocking is not yet implemented.

## Optional local rules
Use the popup's local rules section. Rules are domain suffixes, with a category from Study, Coding, Media, Social, Games, Other. Exclusions override all rules. If tab permission is revoked, classified observation stops rather than silently bypassing exclusions. Disabling local rules removes tab permission and clears rules; coarse tracking can continue.

## Temporary distraction protection
Choose domains and a duration in the popup; approve per-domain host access. Only top-level navigation is blocked. Stop immediately from the popup. Session rules are cleared on browser restart; alarms and periodic checks remove expired rules. This is voluntary protection, not a tamper-proof lock, and is not yet automatically synchronized with server room timers. The Track server itself is excluded.

## Firefox and Chromium builds

Run `node browser/build.mjs` from repository root (Node 22+). Only extension runtime files are copied into `browser/dist/chromium` and `browser/dist/firefox`. Chromium: load unpacked from the first directory. Firefox 128+: open about:debugging, This Firefox, Load Temporary Add-on, and choose the Firefox manifest. Firefox uses an MV3 event page instead of a service worker; shared Promise-based APIs use the browser namespace where available. See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background. Both retain the same explicit opt-in and exclusions. Temporary installation is not store signing; live Firefox/Chromium permission, background suspension and blocking smoke tests remain required.
