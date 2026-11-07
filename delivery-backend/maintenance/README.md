# Optional database maintenance

These scripts are reviewed and run separately by a database administrator. They
are not included in production release artifacts or executed by `npm run migrate`.
Application startup and requests never execute them.

## Courier history index

The history feature reads the existing `locations` and `users` columns; it needs
no new tables or columns and works with the existing database schema.
`location_history_index.sql` is optional performance tuning for installations
without an index beginning with `(user_id, recorded_at)`.

Before a large production rollout, inspect `SHOW INDEX FROM locations` and use
`EXPLAIN` on the history queries. Without this index, MySQL can scan or sort more
records, increasing latency. Adding an index can take time and hold locks, so
review table size, disk space, backups, and a maintenance window before applying:

```sh
mysql -h DB_HOST -u DB_USER -p DB_NAME < maintenance/location_history_index.sql
```

The script reuses an equivalent leading index when present. It adds no columns
and changes no location records. Existing required migrations stay in `migrations/`
and continue to require the deployment system's normal schema review.
