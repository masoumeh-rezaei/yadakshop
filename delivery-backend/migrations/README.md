# Database migrations

Production deployment automatically runs pending migration files in numeric order
against the backend's configured database, after a verified private backup and
before activating the new release. See [deployment operations](../../ops/peik-deploy/README.md).

From the backend directory, the recommended command is:

```bash
npm run migrate
```

The runner records filename, normalized-LF SHA-256, status and application time in
`peik_schema_migrations`. Applied files are skipped and must not be edited or
deleted; add a new numbered file instead. Failed or interrupted files stop future
runs until deliberately recovered with `--retry <exact-filename>`. DDL is not
transactionally rolled back. `--plan` reports pending/baseline/applied files
without writing tables. The runner uses a database advisory lock.

On legacy installations, existing tables from 001 and 002 are checked and
baselined without replaying the saved-place seed. On a fresh database, 001 creates
and seeds saved places. Directly importing SQL bypasses history and is reserved
for deliberate recovery; normal deployment does not need phpMyAdmin or manual SQL.

Example:

```bash
mysql -h DB_HOST -u DB_USER -p DB_NAME < migrations/001_create_saved_places.sql
```

On cPanel, the same file can be imported from phpMyAdmin after selecting the application's database.

The courier history day picker uses the existing schema and requires no new migration. It uses at most ten queries to find populated days without downloading a courier's complete history. An index beginning with `(user_id, recorded_at)` speeds up those queries; review the [optional maintenance procedure](../maintenance/README.md) if it is missing. Performance depends on the existing indexes and table size.

`GET /api/locations/:userId/history/days` returns the ten latest days with records as Gregorian `YYYY-MM-DD` keys in `Asia/Tehran`. The panel displays these keys in the Persian calendar. `GET /api/locations/:userId/history` defaults to the last 24 hours; optional `from` and `to` ISO timestamps with explicit timezones select a window of at most 24 hours, including `from` and excluding `to`. Both endpoints require an active administrator.

Courier task assignments require `002_create_driver_tasks.sql`. The runner also
supports one exact filename for targeted recovery. See [TASKS.md](../TASKS.md) for
data semantics, tests and mobile rollout. Required schema belongs here; optional
history index maintenance remains separate.
