# Database migrations

Run migration files in numeric order against the same MySQL database configured for the backend.

From the backend directory, the recommended command is:

```bash
npm run migrate
```

For the saved-places feature, import `001_create_saved_places.sql` before deploying and restarting the new backend. The migration is idempotent: it creates the table when missing and inserts or refreshes the nine initial Neshan locations without creating duplicates.

Example:

```bash
mysql -h DB_HOST -u DB_USER -p DB_NAME < migrations/001_create_saved_places.sql
```

On cPanel, the same file can be imported from phpMyAdmin after selecting the application's database.

The courier history day picker uses the existing schema and requires no new migration. It uses at most ten queries to find populated days without downloading a courier's complete history. An index beginning with `(user_id, recorded_at)` speeds up those queries; review the [optional maintenance procedure](../maintenance/README.md) if it is missing. Performance depends on the existing indexes and table size.

`GET /api/locations/:userId/history/days` returns the ten latest days with records as Gregorian `YYYY-MM-DD` keys in `Asia/Tehran`. The panel displays these keys in the Persian calendar. `GET /api/locations/:userId/history` defaults to the last 24 hours; optional `from` and `to` ISO timestamps with explicit timezones select a window of at most 24 hours, including `from` and excluding `to`. Both endpoints require an active administrator.

Courier task assignments require `002_create_driver_tasks.sql`. On an existing installation, use `npm run migrate -- 002_create_driver_tasks.sql` to run that file only. See [TASKS.md](../TASKS.md) for data semantics, required deployment approval, tests, and mobile rollout. Unlike the optional history index, this table is required to persist tasks and must not be moved out of migrations.
