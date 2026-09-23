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
