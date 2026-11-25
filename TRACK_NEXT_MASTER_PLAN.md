# Track Next — Master Roadmap

Status: proposed implementation backlog, not a claim that features are shipped.
Base: existing Next.js/React/SQLite Life OS, Android Kotlin/Rust launcher, Linux connector, Dreamer Collective and Assistant. Preserve all current routes and data.

## Product direction
Track Pulse observes active time; Lock-In protects focus; social Pods provide shared study and coworking; Dreamer is a persistent chief of staff with delegated agents, AI Pods and durable missions; Recall/Analytics connect observed evidence to intentional plans. Personal OS stays self-hosted and private. Social is an isolated service receiving only expressly shared summaries.

## Product flows
- Pair browser/desktop/Android, choose what to observe, pause or delete activity at any time. Dashboard shows source health and unknown gaps.
- Start solo focus or invite friends to a permanent Pod or temporary room. Ready checks, synchronized Pomodoro, focus/break phases, late join, personal exit, optional voice/video/chat, report and explicit sharing.
- Ask Chief to accomplish an objective. Chief creates a persistent mission, delegates to scoped specialists, checks evidence/receipts, requests approval where needed and surfaces results in an inbox. Scheduler/worker can run when UI is closed.
- Create custom agents and AI Pods with tool scopes, budget, memory namespace, cadence and kill switch. Group Dreamer reads only opted-in group resources, never private memories by default.

## Design system
Retain dark Track identity, Bricolage/Schibsted/Spline Mono fonts and existing charts. Prioritize Today/Focus/Activity/Pods/Dreamer, keep legacy modules accessible. Global focus mini-player, mobile bottom nav, responsive room layout, accessible timers, clear empty/stale/error states. Never ship illustrative sample numbers as real data.

## Architecture and contracts
- Activity: immutable source intervals (stable event ID, device ID, UTC start/end, coarse category, provenance), bounded batch ingest, local outbox, replay-safe ack, union of overlapping intervals for person-time; per-device totals separately. Unknown is not idle; background AI runtime is not human-active work.
- Focus: server-owned phase timestamps, revisioned operations, stable session ID, explicit pause/resume/end, idempotent save, participant-specific attendance and optional distraction protection. Room time continues independently of participant pauses; emergency exit always available.
- Social: separate identity, DB/API, roles and membership checks; only allowlisted published projections, opt-in presence with TTL, signed expiring invitations, rate limiting, moderation and revocation. No private journal, finance, raw browsing history or documents in social payloads.
- Dreamer: typed mission DAG, step leases and attempts, durable SQLite-backed job queue initially; workers separate from Next requests, bounded concurrent execution, checkpoints, retry, cancellation, deduplication and receipts. Reuse existing provider configuration, per-feature AI consent and global kill switch. Use authorized tool calls, never arbitrary host shell commands. Treat external content and model output as untrusted data. No secrets in prompts/logs. Separate personal and group memory. Confirm consequential external writes, deletes, deployment and spending; narrowly scoped recurring approvals for low-risk actions only.
- Platform: additive migrations with existing backup mechanism, UTC storage/local rendering, offline compatibility, default-off new sensitive collectors, no forced account migration, explicit platform capability reporting.
- Ops: CI typecheck/lint/test/build, security and platform smoke tests, staging first, backup and rollback; merge reviewed independently releasable slices only. Do not mark a PR shipped until merged and tests verified.

## PR sequence
Each item is an intended reviewable PR. Dependencies follow the order within and across phases; independent pure modules can be parallelized. Acceptance criteria are minimum requirements; all code PRs require tests and docs.

### A. Foundation and trustworthy activity

- [ ] **PR 01 — Activity contract.** Define immutable UTC intervals, event IDs, source/device identifiers, confidence, category and schema version; no free-form sensitive payload by default. **Acceptance:** Validate bounds and reject malformed/oversized events.
- [ ] **PR 02 — Activity storage.** Add additive SQLite migrations, indexes, raw retention, canonical interval tables and backups. **Acceptance:** Fresh and existing DB migration tests; no existing rows changed.
- [ ] **PR 03 — Device enrollment.** Create revocable, scoped per-device credentials and pairing UX. **Acceptance:** Revoked token rejected; device cannot impersonate another device.
- [ ] **PR 04 — Batch ingestion.** Add authenticated bounded batch endpoint and idempotent acknowledgments. **Acceptance:** Replay and out-of-order delivery do not duplicate; partial invalid input handled safely.
- [ ] **PR 05 — Interval reconciliation.** Merge overlapping observation windows without inflating person-hours; preserve per-device totals. **Acceptance:** Overlap, parallel device, duplicate, unknown-gap and cross-midnight fixtures.
- [ ] **PR 06 — Activity classification.** User rules and priority order; source-aware project and category mappings. **Acceptance:** Manual overrides persist; reclassification is deterministic.
- [ ] **PR 07 — Offline outbox.** Shared retry/backoff, stable IDs, checkpoints and dead-letter reporting. **Acceptance:** Network loss, crash and retry fixtures; no duplicate records.
- [ ] **PR 08 — Activity privacy controls.** Pause, exclude, retention, deletion, export, provenance and source health. **Acceptance:** Excluded data never leaves collector; revoked sharing and deleted events disappear from derived views.

### B. Browser, desktop and Android collectors

- [ ] **PR 09 — Chromium extension scaffold.** Manifest V3, optional permissions, onboarding, local-only dry run and pairing. **Acceptance:** Load unpacked in Chromium; no network before pairing.
- [ ] **PR 10 — Foreground browser tracking.** Track active tab and focused window changes, idle and lock; domain-level metadata only. **Acceptance:** Background tabs and idle periods excluded; incognito disabled by default.
- [ ] **PR 11 — Browser durable queue.** Persist intervals through MV3 worker suspension; flush using alarms. **Acceptance:** Browser restart and offline replay without duplicates.
- [ ] **PR 12 — Extension popup and rules.** Today summary, pause, exclusions, project mapping, sync state and lock-in launch. **Acceptance:** Keyboard accessible; no fabricated stats.
- [ ] **PR 13 — Browser blocking.** Declarative rules for focus; personal override, scoped temporary rules and emergency exit. **Acceptance:** Rules expire and clean up on crash/restart; no global permanent blocking.
- [ ] **PR 14 — Firefox parity.** Browser API adapter and manifest build; privacy and permission review. **Acceptance:** Parity tests and manual Firefox smoke test.
- [ ] **PR 15 — Linux desktop watcher.** Extend existing connector with opt-in foreground app and idle sources for X11 and supported Wayland compositors. **Acceptance:** Unsupported compositor shown explicitly; no raw window titles by default.
- [ ] **PR 16 — Editor and ActivityWatch adapters.** Integrate editor heartbeats, project mappings and local ActivityWatch import. **Acceptance:** No double counting editor/desktop/browser time; no source code collected.
- [ ] **PR 17 — Android usage tracking.** Consent-gated UsageStats, local intervals, launcher controls and existing offline sync compatibility. **Acceptance:** Permission loss and battery restrictions handled honestly.
- [ ] **PR 18 — Cross-platform packaging.** Desktop/Android collector status, signed releases where available, install and uninstall docs; Windows/macOS staged. **Acceptance:** Smoke tests on supported platforms; unsupported collectors labeled.

### C. Lock-In and Pomodoro

- [ ] **PR 19 — Durable session state.** Replace local-only timer with server-backed session IDs, timestamps, revision and retryable saves. **Acceptance:** Crash, refresh, lost acknowledgment and duplicate save tests.
- [ ] **PR 20 — Session clock.** Pure authoritative timestamp-based phase engine for focus, short/long break, pause and completion. **Acceptance:** Boundary, reconnect, clock drift and multi-round tests.
- [ ] **PR 21 — Personal session UI.** Global start button, mini-player, countdown/count-up, session objective and task/project links. **Acceptance:** Route changes, reload, keyboard and mobile tests.
- [ ] **PR 22 — Focus profiles.** Pomodoro presets, custom duration, study, coding, flow and strict modes. **Acceptance:** Limits enforced; strict always offers an emergency exit.
- [ ] **PR 23 — Cross-device state.** Versioned start/pause/resume/end, heartbeat, device capabilities and offline conflict resolution. **Acceptance:** Concurrent actions converge; duplicate requests safe.
- [ ] **PR 24 — Distraction policy.** Optional browser blocklist and platform-supported Android controls; no overpromising OS restrictions. **Acceptance:** Allowlist and escape route; policy removal on end.
- [ ] **PR 25 — Session report.** Distinguish planned, elapsed, active and unknown time; outcomes, task links and corrections. **Acceptance:** No double counting; report evidence traceable.
- [ ] **PR 26 — Focus UI polish.** Fullscreen zen mode, sounds, break alerts, scheduling, accessibility and reduced motion. **Acceptance:** Notification permissions respected; screen reader and contrast checks.

### D. Friends, pods and multiplayer rooms

- [ ] **PR 27 — Social service boundary.** Separate social DB/API and private owner-only OS; publish explicit projections only. **Acceptance:** No cross-user private-record access; penetration tests.
- [ ] **PR 28 — Identity and invitations.** Account auth, invite expiration, membership lifecycle, block/remove/report and rate limits. **Acceptance:** Token theft, replay and authorization tests; no shared owner password.
- [ ] **PR 29 — Friends and presence.** Consent-based statuses with expiration and visibility rules. **Acceptance:** Offline stale state expires; friend removal revokes visibility.
- [ ] **PR 30 — Persistent pods.** Group membership, owner/mod/member roles, invitations and privacy settings. **Acceptance:** Role and membership isolation tested.
- [ ] **PR 31 — Room lifecycle.** Lobby, objectives, ready checks, host transfer, scheduled/drop-in rooms, participant exits. **Acceptance:** Host disconnect and join/rejoin handled.
- [ ] **PR 32 — Synchronized room clock.** Server start time, revision, focus/break phases and reconnect snapshot; personal participation separate. **Acceptance:** Multi-client test with lag and conflicting commands.
- [ ] **PR 33 — Realtime transport.** SSE/WebSocket scoped channels, reconnect cursors and bounded presence. **Acceptance:** Unauthorized room subscriptions fail; degraded polling works.
- [ ] **PR 34 — Break chat and media.** Moderated chat, mute, optional voice/video and screen share via vetted WebRTC architecture; no recording by default. **Acceptance:** Consent, blocking, moderation and network tests.
- [ ] **PR 35 — Shared progress and challenges.** Approved aggregate summaries, accountability, goals, reactions, share cards and privacy settings. **Acceptance:** No raw browsing logs or private tasks shared; revocation tested.
- [ ] **PR 36 — Pod workspace.** Shared resources, tasks, calendar, flashcards, recurring sessions, notifications, moderation and responsive UX. **Acceptance:** Member boundaries and mobile flow end-to-end.

### E. Dreamer persistent runtime

- [ ] **PR 37 — Mission contract.** Typed mission/step states, ownership, dependencies, cancellation, budgets and approvals. **Acceptance:** Invalid transitions and circular dependencies rejected.
- [ ] **PR 38 — Durable job storage.** Additive tables for queue, step attempts, leases, checkpoints, idempotency and receipts. **Acceptance:** Restart recovery and expired lease tests.
- [ ] **PR 39 — Worker service.** Separate bounded worker with lease renewal, shutdown, retry and dead-letter handling. **Acceptance:** No duplicate side effects after worker failure; queue survives restart.
- [ ] **PR 40 — Chief orchestration.** Refactor existing chief.ts to plan durable missions, delegate selectively, review receipts and synthesize. **Acceptance:** Prior missions remain readable; partial and failed steps surfaced.
- [ ] **PR 41 — Agent identities.** Preserve existing agents; custom Secretary, Coach and Quartermaster; scoped capabilities and model preferences. **Acceptance:** Default-deny tool permissions; disable agent mid-mission.
- [ ] **PR 42 — AI pods.** Persistent teams with roles, objectives, memory namespace and independent budgets. **Acceptance:** Pod membership and memory isolation tests.
- [ ] **PR 43 — Memory system.** Evidence-linked private/agent/pod memories, corrections, expiry, export and deletion. **Acceptance:** No cross-pod private memory retrieval; deletion invalidates summaries.
- [ ] **PR 44 — Scheduler and triggers.** Cron/interval/event triggers with timezones, dedupe and per-trigger consent. **Acceptance:** DST, restart, repeated event and missed-run behavior tested.
- [ ] **PR 45 — Mission control.** Progress, approvals, receipts, cancel/retry, partial output and agent inbox. **Acceptance:** Status reflects actual job records; no fabricated completion.
- [ ] **PR 46 — Group Dreamer.** Separate social-pod AI identity and group-only sources; participant-approved sharing. **Acceptance:** Personal data never reaches group model context automatically.

### F. Tools, integrations and automation

- [ ] **PR 47 — Capability registry.** Typed tool schemas, policy checks, scope, risk classes, result receipts and idempotency. **Acceptance:** Unknown tools and unauthorized parameters fail closed.
- [ ] **PR 48 — Track record tools.** Reuse validated assistant operations with tighter write scopes, audit and undo. **Acceptance:** Unsafe bulk writes and unauthorized entities rejected.
- [ ] **PR 49 — Research tools.** Web retrieval with citations, untrusted-content handling, network allow/deny and SSRF protection. **Acceptance:** External instructions cannot grant permissions; private IP and redirects blocked.
- [ ] **PR 50 — GitHub tools.** Read repos/issues/PRs by allowlist; draft changes and explicit approval for writes/deploys. **Acceptance:** Least privilege and PR receipt verification; no shell credentials exposed.
- [ ] **PR 51 — Calendar and email.** Scoped read, draft and approved write; invitations/sending gated. **Acceptance:** Recipient/target preview and idempotency; revocation works.
- [ ] **PR 52 — Files and sandbox.** Bounded artifact generation and isolated execution, CPU/memory/time limits, no host access. **Acceptance:** Escape and secret exposure tests; downloadable artifacts.
- [ ] **PR 53 — MCP and workflow engine.** Connector catalog, explicit tool discovery, typed workflow DAG, dry run and manual approvals. **Acceptance:** Tool output treated as data; no implicit delegated authority.
- [ ] **PR 54 — Sentinel and notifications.** Monitors for deadline, release and change triggers; digest, quiet hours and delivery receipts. **Acceptance:** No spam or invented active monitoring; disable and retry tested.

### G. UI/UX, analytics and studio

- [ ] **PR 55 — Navigation and shell.** Keep visual identity; prioritize Today, Focus, Activity, Pods and Dreamer, retain all existing routes. **Acceptance:** Keyboard navigation, mobile bottom nav and no broken links.
- [ ] **PR 56 — Command Center.** Live session, activity coverage, next action, device health, personalization. **Acceptance:** Illustrative data never appears as real production data.
- [ ] **PR 57 — Activity timeline.** Day view with source, project/category, unknown gaps and correction UI. **Acceptance:** Timezone and overlaps accurate; user can edit/delete.
- [ ] **PR 58 — Analytics workspace.** Unique person-time vs device-time, charts, heatmaps, planned vs actual, AI human/runtime distinction. **Acceptance:** Totals reconcile to canonical records; no claims of mental focus.
- [ ] **PR 59 — Agent Studio.** Custom agents/pods, scope editor, triggers, preview, budgets and import/export. **Acceptance:** Imported config never auto-grants permissions or enables schedules.
- [ ] **PR 60 — Dreamer inbox and briefs.** Daily/weekly reports, approvals, evidence, per-agent history and deep links. **Acceptance:** Dismissal, correction and kill switch tested.
- [ ] **PR 61 — Recall and search.** Search authorized activity, notes and project history with local indexing. **Acceptance:** Excluded/deleted data not indexed; no raw sensitive URLs by default.
- [ ] **PR 62 — Wrapped and sharing.** Export share cards, private public-profile toggle, widgets and recap reports. **Acceptance:** Preview and explicit field selection; revocable links.

### H. Security, reliability and release

- [ ] **PR 63 — Threat model.** Document trust boundaries, threat actors, data flow, abuse controls, OAuth/token threat model. **Acceptance:** Review before enabling social or autonomous writes.
- [ ] **PR 64 — Prompt-injection defense.** Separate instructions from data, validate tool calls, no arbitrary host execution, redaction. **Acceptance:** Adversarial web/tool/pod-memory tests and denied exfiltration.
- [ ] **PR 65 — Privacy and data lifecycle.** Retention, deletion, export, audit, consent history, opt-outs and backup policy. **Acceptance:** Deletion and revocation propagate to caches and projections.
- [ ] **PR 66 — Database and recovery.** Migration dry run, backup restoration, queue repair, rollback/runbooks. **Acceptance:** Realistic old DB snapshot fixture; no data loss.
- [ ] **PR 67 — Observability and limits.** Health, structured redacted logs, latency metrics, quotas, budget and rate limits. **Acceptance:** No secrets in logs; stop runaway jobs.
- [ ] **PR 68 — Accessibility/performance.** Keyboard, screen reader, contrast, mobile, large datasets and reduced motion. **Acceptance:** Measured tests and documented known limitations.
- [ ] **PR 69 — End-to-end release checks.** Multi-device, group room, recovery, permissions, agent receipts, CI and integration matrix. **Acceptance:** Green typecheck/lint/test/build and required platform smoke tests.
- [ ] **PR 70 — Deployment and rollout.** Feature flags default off for risky changes, staging, migration backup, canary and rollback plan. **Acceptance:** Never deploy unverified code; release notes and user opt-in.

## Release gates
1. Private time tracking and solo lock-in are the first usable milestone; collector permissions and data coverage visible.
2. Social stays disabled until separate auth, authorization, isolation and abuse tests pass.
3. Dreamer read-only durable missions first; writes and scheduled execution only after scoped approvals, receipts, budget and recovery tests.
4. Production rollout requires backup, CI, platform smoke tests and rollback. No unverified merge/deployment merely to satisfy PR count.

## Research references
- ActivityWatch: https://github.com/ActivityWatch/activitywatch and https://github.com/ActivityWatch/aw-watcher-web
- WakaTime: https://github.com/wakatime and Hackatime: https://hackatime.hackclub.com/
- Chrome extension APIs: https://developer.chrome.com/docs/extensions/reference/api/
- Android usage stats: https://developer.android.com/reference/android/app/usage/UsageStatsManager
- Focusmate: https://www.focusmate.com/ ; Linear: https://linear.app/ ; Raycast: https://www.raycast.com/
- Screenpipe (optional sensitive local capture, not default): https://screenpipe.com/
