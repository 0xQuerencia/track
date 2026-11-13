# Track

A self-hosted personal "life operating system" and its Android launcher. Plan your study, focus, tasks, habits, health, money and journal in one fast dashboard, and keep the important parts on your phone's home screen.

| | |
| --- | --- |
| [`web/`](web) | The dashboard. Next.js, SQLite, one shared password. Also serves the sync API. |
| [`android/`](android) | The launcher. Kotlin and Compose UI over a Rust core that caches data and queues changes offline. |

The launcher talks to the dashboard through a small bearer-token API (`/api/v1/today`, `pull`, `push`), so your data stays on a server you control.

Start with the README in each folder. MIT licensed.
