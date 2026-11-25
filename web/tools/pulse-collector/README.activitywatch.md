# Local ActivityWatch import

Export JSON from ActivityWatch (see https://github.com/ActivityWatch/docs/blob/master/src/api/rest.rst). Choose the matching currentwindow and afkstatus buckets for one device. The importer intersects observed window time with not-afk intervals, never imports titles, URLs, raw app names or text, and hashes stable interval IDs.

Dry run: node activitywatch.mjs export.json WINDOW_BUCKET AFK_BUCKET 7

After reviewing the count and using an activity-only token, set TRACK_PULSE_ENABLED=1 and append --send. The existing HTTPS/queue checks apply. Optional TRACK_PULSE_APP_MAP sends only coarse categories (requires category-aware server). Repeating the same import uses stable IDs. A changing ActivityWatch export can generate overlapping observations; Track deduplicates human-time by union, not by summing them.

No direct Wayland API is claimed: this works with supported ActivityWatch watchers that have matching AFK data. The original export remains local and is not uploaded.
