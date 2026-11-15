# Track

A self-hosted personal "life operating system": study planning, focus sessions, tasks and habits, health, media, projects, money and a journal, in one fast dashboard. Single user, one SQLite file, no external services.

Built with Next.js (App Router), React 19, Tailwind v4, Anime.js and a small Bklit-style chart set. Data lives in Node's built-in `node:sqlite`, so there are no native modules to compile.

The Android launcher that syncs with this app lives in [`../android`](../android).

## What's in it

- **Command Center**: greeting, top priorities, exam countdown, habits, study progress; widgets can be hidden and reordered
- **Study HQ**: syllabus with mastery per chapter, lectures, study sessions, mistakes log, exams (ships with a CBSE Class 12 PCM starter syllabus you can edit)
- **Focus**: timer with distraction counting, screen-time logging
- **Plans**: tasks and a habit grid
- **Health, Media, Projects, Money, Journal**, plus universal search

Every record type is defined once in `src/lib/entities.ts`; the schema, forms, validation and search all derive from it.

## Run it

Requires Node 22.5+ (for `node:sqlite`) and pnpm.

```bash
cp .env.example .env.local   # then edit TRACK_PASSWORD
pnpm install
pnpm dev                     # http://localhost:3000
```

Production:

```bash
pnpm build
node .next/standalone/server.js   # copy .next/static and public next to it first
```

Put it behind HTTPS and set `TRACK_COOKIE_SECURE=1`. With a reverse proxy, set `TRACK_PUBLIC_URL` to the public address so login redirects and server actions use it.

## Configuration

| Variable | Purpose |
| --- | --- |
| `TRACK_PASSWORD` | Required. The one shared password for the web UI. Changing it signs everyone out. |
| `TRACK_API_TOKEN` | Optional. Bearer token (24+ chars) enabling the sync API for the Android app. |
| `TRACK_NAME` | Name used in the greeting. |
| `TRACK_TZ` | IANA time zone for "today" (default `UTC`). |
| `TRACK_DB` | SQLite path (default `./data/track.db`). |
| `TRACK_COOKIE_SECURE` | `1` to mark the session cookie `Secure`. |
| `TRACK_PUBLIC_URL` | Public base URL when behind a proxy. |

### Optional AI features

Set `OPENROUTER_API_KEY` to enable OpenRouter, then opt in per feature under **Settings → AI and privacy**. The default model is [`z-ai/glm-5.3-flash`](https://openrouter.ai/z-ai/glm-5.3-flash); `OPENROUTER_MODEL` can select another OpenRouter model slug. `TRACK_AI_DISABLED=1` blocks all AI requests regardless of saved consent. Consent starts off. AI call history records only the feature, model, time, token counts and result code; prompts and responses are not stored. Features must show the redacted excerpts they intend to send before requesting them.

## Life OS modules

All modules share one SQLite database, one record-link table (`record_links`) and one search index. Everything is web-only; the Android API is unchanged.

| Area | Routes |
|------|--------|
| Life | `/study` (revision planner, mocks, prerequisites), `/focus`, `/plans` (goals, routines, weekly plan), `/calendar`, `/health`, `/money` (budgets, recurring, CSV export), `/journal`, `/review` (day/week/month) |
| Work | `/projects` (+ detail, inventory import), `/sessions` (AI session metadata), `/ideas` (convert to project), `/career` |
| Personal | `/knowledge` (notes, bookmarks, backlinks), `/media`, `/people`, `/documents` (private vault), `/timeline` |
| System | `/devices`, `/integrations`, `/settings` (scoped integration tokens) |

`Ctrl/Cmd+K` opens the command palette (search, go-to, quick create).

**Schema and upgrades.** `src/lib/migrations/` is a versioned, additive registry tracked in `schema_migrations`. Before any pending migration touches an existing database file, a `VACUUM INTO` backup is written next to it (last 5 kept). Back up `data/` yourself before upgrading a production install, and never commit `data/`.

**Linux connector.** `tools/track-connector/` (see its README) sends only sanitized metadata (repo facts, session ids and timestamps, never transcripts) using a scoped token created under Settings. Without it, paste JSON on `/integrations`.

**Honesty rules.** Device and service status shows Unknown unless verified; progress figures are counts of real rows; reviews and the timeline are computed from records, with no estimates.

**Checks.** `pnpm typecheck`, `pnpm lint`, `pnpm test` (node:test via tsx), `pnpm build`.

**GitHub sync.** Optional and read-only: set `GITHUB_TOKEN` and a "Sync from GitHub" button appears on `/integrations`. It only calls `api.github.com` for projects whose repo URL is a plain `https://github.com/owner/repo`. Antigravity has no documented local format, so it is reported as unsupported.

## Sync API

Used by the Android launcher; all routes need `Authorization: Bearer $TRACK_API_TOKEN`.

- `GET /api/v1/today`: compact home-screen snapshot
- `GET /api/v1/pull`: full cache (tasks, chapters, exams, lectures, habits, habit logs)
- `POST /api/v1/push`: `{ "ops": [...] }`, a batch of queued changes. Each op carries a client-generated `opId`; replaying one is a no-op, so retries after a timeout are safe. Only tasks, focus/study/screen logs, chapter progress, lecture progress and habit ticks can be written this way.

## Security notes

- One shared password, signed HMAC session cookie, login rate limit (8 attempts per 10 minutes per IP). This is built for one person on a server you control, not for multi-user hosting.
- All SQL uses bound parameters; column names come from the entity definitions, never from requests.
- Back up `data/track.db`; it is your only copy of the data.

## License

MIT (see the repo root).
