# Social maintenance and moderation (host-side only)

Use the separate Social Unix user/container, environment and data directory. No public admin endpoint exists.

- `node social/src/admin.mjs maintenance`: dry-run counts only.
- `node social/src/admin.mjs maintenance --apply`: delete expired sessions, consumed/expired invites, stale presence, chat older than seven days, progress/challenges older than the 30-day window, and resolved reports/admin audit older than 90 days. Review dry-run first, then schedule daily if approved. Pod/workspace and active accounts are not pruned.
- `node social/src/admin.mjs backup`: consistent SQLite snapshot in private data/backups with a unique filename and mode 0600. Keep backups encrypted or access-restricted, apply an explicit retention schedule; deletion does not remove historical backups automatically.
- `node social/src/admin.mjs reports list`: open report metadata only. `reports show ID`: inspect private note. `reports resolve ID`: mark reviewed and record a minimal audit event; no automatic punishment. Do not share report output with the subject.

Restore only during planned downtime: stop Social, preserve the live database and WAL/SHM files, verify backup application_id and integrity_check with SQLite, copy the chosen backup into the dedicated location with mode 0600, remove stale WAL/SHM only after preserving them and confirming no process is using the old DB, restart, check health and test an authorized account. Never point this procedure at the personal Track database. Full disaster-recovery rehearsal and moderation policy remain release gates.