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

For the courier history day picker, apply `002_location_history_index.sql` with the same command before restarting the backend. It adds a `(user_id, recorded_at)` index only when an equivalent leading index does not already exist. The day picker uses at most ten indexed lookups, skipping days without records, and does not scan or download a courier's complete history.

`GET /api/locations/:userId/history/days` returns the ten latest days with records as Gregorian `YYYY-MM-DD` keys in `Asia/Tehran`. The panel displays these keys in the Persian calendar. `GET /api/locations/:userId/history` defaults to the last 24 hours; optional `from` and `to` ISO timestamps with explicit timezones select a window of at most 24 hours, including `from` and excluding `to`. Both endpoints require an active administrator.
