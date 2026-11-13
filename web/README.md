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
