# Study: Question Vault, adaptive revision and study jobs

## What it is
Study HQ now keeps every question you save, grades it Red / Yellow / Green, schedules the next review with a
deterministic spaced-repetition rule, and builds a daily plan around your calendar. Everything lives in the
existing Track database (migration `m150_qvault`) and behind the existing login.

## Setup
* **Screenshot reading** prefers the AI model (the router in `AI_BASE_URL`, vision-capable, low reasoning effort): it keeps maths as LaTeX and splits several questions itself. It is off until you tick "Let the AI model read my screenshots" in the Vault (consent feature `vault`); the image is sent to your AI provider. If it is off, unconfigured or fails, Tesseract is used, then typing.
* **OCR** uses the `tesseract` binary on the server (`pacman -S tesseract tesseract-data-eng`, `apt install tesseract-ocr`).
  More languages: install the language data (e.g. `tesseract-data-hin`); the Vault shows an OCR language picker when more than one is installed.
  Without Tesseract everything still works: the screenshot is saved and you type the text.
* AI is optional: without it everything still works through Tesseract or typing.
* **Time zone**: set in Study settings (defaults to `TRACK_TIMEZONE`/`TRACK_TZ`, else Asia/Kolkata).

## Scheduling rule
Red 1 day, Yellow 3, first Green 7, then the ladder 14, 30, 60 (editable). Each step is scaled by difficulty,
past lapses, weak-topic mastery and importance, credited for late successes, and capped inside the exam window
(a third of the days left for red/yellow, half for green). A hint turns a Green into Yellow. Details: `src/lib/qv/scheduler.ts`.
Chapter mastery needs 5 graded questions before it shows a percentage and is never raised by lectures (`src/lib/qv/mastery.ts`).

## Background jobs
| Job | Default | Does |
| --- | --- | --- |
| plan | 05:00 | rebuilds today's plan, removes abandoned screenshots |
| exam | 05:10 | pulls reviews forward inside the exam window, spreads days over the daily cap |
| reminder | 06:00 | notification with due/overdue counts |
| evening | 21:00 | lists unfinished blocks, builds tomorrow's recovery plan |
| weekly | Sun 20:00 | weekly performance review |

Each job has one row per slot in `qv_job_runs` (unique on job + slot), so running it twice, from two processes, or after
downtime does the work once for the latest slot that is still useful (reminder 12 h, evening 6 h, plan/exam 20 h, weekly 72 h).
A failed run retries after 10 minutes; a run stuck "running" is taken over after 10 minutes.

Two ways to run them; use either or both:
1. **In the server** (default): `src/instrumentation.ts` ticks every minute. Turn off with `TRACK_JOBS=off`.
2. **External timer** for hosts that sleep or restart often. Create an integration token with the `study:jobs` scope
   (Settings, Integrations) and call it every few minutes:
```
# /etc/systemd/system/track-study.service
[Service]
Type=oneshot
EnvironmentFile=/etc/track/study.env        # TRACK_STUDY_TOKEN=trk_...
ExecStart=/usr/bin/curl -fsS -X POST -H "Authorization: Bearer ${TRACK_STUDY_TOKEN}" https://track.example.com/api/study/jobs
# /etc/systemd/system/track-study.timer
[Timer]
OnCalendar=*:0/5
Persistent=true
[Install]
WantedBy=timers.target
```
Job status and "Run now" buttons are on Study, Settings.

## Data and backup
SQLite on a persistent disk (screenshots are stored in the database, so they follow it). Do not run it on an ephemeral
serverless filesystem. Study, Settings has **Download backup** (JSON with images, OCR text and attempts) and **Restore**
(adds what is missing; restoring twice changes nothing). Also back up `data/track.db` as usual.

## Limits
* Maths comes out as `\(...\)` LaTeX text and is not rendered yet. Tesseract reads printed text; equations, fractions, subscripts and handwriting are often wrong. The UI warns and keeps the screenshot beside the text.
  There is no math OCR engine; nothing is guessed.
* Notes and journal entries are not used for planning (no entry-level control was built).
* The plan rebuilds when you press Rebuild, save settings, finish the evening job, or the plan job runs; completing a task elsewhere is picked up on the next rebuild.
