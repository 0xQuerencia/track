# Dreamer scheduled runs

Create an integration token with the `dreamer:run` scope in the Integrations area. A systemd timer or cron job can POST to `https://<your-track-host>/api/dreamer/run` with `Authorization: Bearer <token>`. The route requires this scope, is rate limited by the integration auth layer, and returns counts and the local date only.

Example cron entry (store the token in a root-readable environment file, never in the crontab itself):

```cron
15 6 * * * . /etc/track/dreamer.env; curl --fail --silent --show-error -X POST -H "Authorization: Bearer $TRACK_DREAMER_TOKEN" "$TRACK_PUBLIC_URL/api/dreamer/run" >/dev/null
```

The run is idempotent per Track local date. Layer B remains off unless Dreamer consent is enabled and its scope allows daily calls; otherwise the job runs only the local baseline.

## Read-only GitHub Actions specialist

To use **Check GitHub Actions** from the assistant or Mission Control, initialize
the Track web database and share its `TRACK_DB` path with the Dreamer worker:

- Set `TRACK_DREAMER_CI_ENABLED=1` and set
  `TRACK_DREAMER_GITHUB_REPOS` to a comma-separated allowlist (e.g.
  `0xQuerencia/track`) in the web **and** worker environments.
- For private repositories or authenticated limits, optionally provision a
  fine-grained, repository-scoped `TRACK_DREAMER_CI_GITHUB_TOKEN` with
  **Actions: read** only. Public reads do not require it. Never share the token
  in an objective or commit it. A changed token or removed allowlist entry
  disables jobs queued under the old configuration.
- Start the existing worker: `TRACK_DREAMER_WORKER_ENABLED=1 pnpm dreamer:worker`.
  The specialist does not require a model key, AI consent, or an external
  assistant platform.

Choose one repository and queue a check. Track performs one timeout- and
size-bounded GitHub API GET of five recent Actions runs across branches, then
saves the status, timestamps, run links, and attempt receipt. It does not read
logs or diagnose failures, and never dispatches, reruns, pushes, or edits
anything. Cancelling a mission prevents late responses from being recorded but
cannot recall a request already sent to GitHub.
