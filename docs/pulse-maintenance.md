# Activity retention maintenance

Activity ingestion prunes intervals ending more than 30 days ago. If a collector is disconnected, use the Activity page's **Prune expired activity now** control or schedule the maintenance endpoint daily.

1. Create a separate token in Settings with only `activity:maintenance`.
2. Keep it in a private environment file, never in a URL or command history.
3. Schedule `POST /api/integrations/activity/maintenance` using that bearer token. The response gives only a count; the endpoint cannot erase recent intervals or change privacy settings.

Example (with `TRACK_URL` and `TRACK_MAINTENANCE_TOKEN` already set):

```sh
curl --fail --silent --show-error -X POST -H "Authorization: Bearer $TRACK_MAINTENANCE_TOKEN" "$TRACK_URL/api/integrations/activity/maintenance"
```

Device-specific erasure in Activity → Pair and manage devices revokes that token (all of its scopes) and deletes its stored intervals in one transaction. Pair again with a new token if needed; do not replay old local queues. Backups remain subject to the owner's separate backup retention policy.
