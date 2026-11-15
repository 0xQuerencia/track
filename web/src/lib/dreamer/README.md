# Dreamer scheduled runs

Create an integration token with the `dreamer:run` scope in the Integrations area. A systemd timer or cron job can POST to `https://<your-track-host>/api/dreamer/run` with `Authorization: Bearer <token>`. The route requires this scope, is rate limited by the integration auth layer, and returns counts and the local date only.

Example cron entry (store the token in a root-readable environment file, never in the crontab itself):

```cron
15 6 * * * . /etc/track/dreamer.env; curl --fail --silent --show-error -X POST -H "Authorization: Bearer $TRACK_DREAMER_TOKEN" "$TRACK_PUBLIC_URL/api/dreamer/run" >/dev/null
```

The run is idempotent per Track local date. Layer B remains off unless Dreamer consent is enabled and its scope allows daily calls; otherwise the job runs only the local baseline.
