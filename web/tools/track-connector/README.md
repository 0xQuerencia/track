# track-connector

A small Node script that tells your Track server which git repositories and
AI coding sessions exist on this Linux account, and when they were last
active. It is one file with no dependencies (`connector.mjs`), needs Node 22
or newer, and runs as an ordinary user.

It reads metadata only. It never reads message text, never runs an AI tool,
and never writes to the tools' folders.

## What it reads

| Source | What is read | How |
|---|---|---|
| Git repos under your `roots` | Remote URL, current branch, last commit id, date and subject | Read-only `git` commands through `execFile` (no shell), with a 5 s timeout |
| Claude Code, `~/.claude/projects/**/*.jsonl` | File name (session id), file modification time, and from the first 64 KB only: the working folder, first timestamp, model name. A title only if `sendTitles` is on. | Opened read-only |
| Codex, `~/.codex/sessions/**/rollout-*.jsonl` | Session id, working folder, timestamp from the first line (the first 256 KB at most) | Opened read-only |
| OpenCode, `~/.local/share/opencode/storage/session/**/*.json` | Session id, directory, created and updated times. Title only if `sendTitles` is on. Files over 256 KB are skipped. | Read-only |
| Running processes | Executable name and working directory of processes named `claude`, `codex` or `opencode`, from `/proc` | Read-only |
| Antigravity | Nothing. Reported as `unsupported`. | - |

The connector never opens transcript text for sending. Message content fields
are parsed past and discarded, so they cannot reach the payload.

## What it sends

Every request is an HTTPS POST (or GET for the heartbeat) with
`Authorization: Bearer <token>`. The server checks the token's scope.

1. **Heartbeat** `GET /api/integrations/ping`: nothing but the bearer header.
2. **Inventory** `POST /api/integrations/inventory` (scope `projects:write`), one entry per repo:
   - `external_id`: `git-` plus the first 40 hex characters of a SHA-256 of the normalised remote, or of the absolute path if there is no remote. The hash hides the URL in that id.
   - `name`: folder name.
   - `local_path`: the absolute path of the repo. This is needed to match projects exactly. It is sent in full.
   - `git.remote_url`: the remote in `https://host/owner/repo` form, **with any username or password removed** and `.git` stripped.
   - `git.current_branch`, `git.last_commit` (`sha`, `message` = subject line only, `at` = commit date).
3. **Sessions** `POST /api/integrations/sessions` (scope `sessions:write`), one request per tool, at most 1000 sessions per request. Each item contains only:
   - `external_id` (the tool's session id), `created_at`, `last_activity_at`
   - `cwd_hint` (the working folder, in full) and `project_hint` (the enclosing repo path, or the folder)
   - `status`: `running_verified` or `historical`
   - `resume_command`: a documented form such as `cd /path && claude --resume <id>`. Track displays it and never runs it.
   - `model` (if the file states one)
   - `title`: **null unless you set `"sendTitles": true`**. Even then, only the title field the tool itself stores is used (Claude Code's `summary` line, OpenCode's `title`). No message text.

**Never sent:** message or transcript text, file contents, environment variables,
command lines of processes (only the executable name is matched), your
home-folder listing, anything outside the roots, and the token itself (it is
never written to a file, a log, or an error message).

A `running_verified` status means a process of that tool is running in that
exact folder. It does not prove the process is that specific session.

## Setup

1. In Track, open **Settings** and create a token with the scopes
   `metadata:write`, `sessions:write` and `projects:write`. It is shown once. Copy it.
2. Put the token in an environment file on the machine, readable only by you:
   ```
   mkdir -p ~/.config/track-connector
   printf 'TRACK_CONNECTOR_TOKEN=%s\n' 'trk_...' > ~/.config/track-connector/env
   chmod 600 ~/.config/track-connector/env
   ```
3. Copy `config.example.json` to `~/.config/track-connector/config.json` and edit
   `serverUrl` and `roots`. Roots must be folders under your home directory.
   A `token` key in the config is refused.
4. Check what would be sent, without sending anything:
   ```
   TRACK_CONNECTOR_TOKEN=... node connector.mjs once --dry-run
   ```
5. Send it:
   ```
   export TRACK_CONNECTOR_TOKEN=trk_...
   node connector.mjs push       # everything
   node connector.mjs once       # only what changed (what the timer runs)
   ```
6. Optional: install `track-connector.service` and `track-connector.timer`
   under `~/.config/systemd/user/`, edit the paths, then
   `systemctl --user daemon-reload && systemctl --user enable --now track-connector.timer`.

## Commands

| Command | Network | What it does |
|---|---|---|
| `scan` | none | Lists the repos it found, as JSON |
| `sessions` | none | Per tool: status (`ok`, `not_found`, `unsupported`, `error`), count found, and error codes |
| `push` | yes | Sends everything, ignoring saved state |
| `once` | yes | Sends only new or changed items, using `~/.local/state/track-connector/state.json` |
| add `--dry-run` | none | Prints the exact JSON that `push` or `once` would send |

Exit codes: `0` success, `1` a send or network failure (details on stderr,
token redacted), `2` bad usage or config.

## Behaviour

- Roots are resolved with `realpath` and must stay under your home directory.
  Symlinks are not followed while scanning. Folders named `node_modules`, `.cache`
  and any hidden folder are skipped, except `.git` itself. Scanning goes at most
  three folders deep, and does not look inside a repo.
- Requests retry only on network errors, timeouts, 429 and 5xx, with delays of
  1, 2 and 4 seconds. Other errors stop at once. Redirects are refused so the token
  cannot follow one.
- A plain `http://` server URL is accepted only for `localhost`.
- The state file records each sent session's file time and status, and each
  inventory entry's hash. A failed send is not recorded, so it is retried next run.
- Unreadable or unrecognised files are counted and skipped. Error text names only
  an error code and the file's base name, never its contents.

## Tests

```
node --test web/tools/track-connector/connector.test.mjs
```

The tests cover credential removal, the path allowlist, the config rules, the
payload whitelist, retry behaviour with a fake `fetch`, and that a read run
leaves the tool folder unchanged.

## Revoking

Revoke the token in Settings. The next run gets 401 and stops. Delete the
environment file and the state folder to remove this machine's local state.
