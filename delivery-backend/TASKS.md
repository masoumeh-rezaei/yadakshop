# Courier tasks

An assignment is one courier/place pair in `driver_tasks`. Both map selectors use
the same idempotent `PUT /api/tasks/assignment` endpoint. A unique key prevents
duplicates. Transactions lock the courier and place before writing. Inactive
couriers cannot receive new tasks, but an administrator can cancel an existing
pending assignment. Parent deletion cascades through foreign keys.

Tasks are `pending`, `completed`, or `cancelled`. Unchecking cancels a pending
task. Checking a completed/cancelled pair reopens it with a new revision and
assignment timestamp; this is a current assignment record, not an append-only
audit log. Completion checks the revision so an outdated phone cannot complete
a newly reassigned task. Retrying the same completion is idempotent.

Administrators can list tasks, assign/cancel pairs, and complete tasks. Drivers
use `/api/tasks/mine`, whose driver ID comes exclusively from authentication.
Drivers cannot list all tasks or change assignments and can complete only their
own tasks. Every request checks the user's current active status. Admin sockets
receive an ID-only invalidation after committed mutations; the app refreshes its
own tasks every 15 seconds while foregrounded and immediately on resuming.

## Required database migration

This feature needs a new table. `002_create_driver_tasks.sql` is a required
migration, not optional index maintenance. It derives numeric foreign-key column
types from the existing parent tables, including signedness. Apply `001` first
on a new database; an existing installation should apply only `002` to avoid
rerunning the original saved-place seed/upsert.

After backup and compatibility review, from a checkout containing this feature:

```sh
cd delivery-backend
npm run migrate -- 002_create_driver_tasks.sql
```

The runner validates the exact filename before opening a database connection.
Alternatively import only that SQL file into the selected database using
phpMyAdmin. The table creation is idempotent. MySQL DDL can commit implicitly;
the runner's transaction wrapper is not a promise of schema rollback.

Production migration and approval remain manual, as documented in
`ops/peik-deploy/README.md`. After preparing the database, the administrator must
record `peik-deploy approve-schema <current-main-SHA>` and rerun the current main
deployment. The pipeline never executes SQL. Before preparation, task endpoints
return a clear 503 while existing map/location endpoints remain available.
The API health check also verifies the required task columns without reading
rows, so a candidate cannot be promoted against an unprepared database even if
schema approval was accidentally recorded too early.

## Client releases

Deploy the matching backend and panel together. The panel build includes
`driver-map.html`, a small map-only entry point with bundled Leaflet. The mobile
map loads it from `EXPO_PUBLIC_MAP_URL`, defaulting to `${EXPO_PUBLIC_API_URL}/driver-map.html`.
Map data is delivered by the app bridge; the map page receives no bearer token,
does not fetch tasks, and renders names as text. Driver location tracking and
its disclosure/permission flow remain separate from task polling.

A new Android build is needed because `react-native-webview` was added. The
existing GitHub deployment publishes the web/backend only; it does not install
a new APK on a driver's device.

## Checks

```sh
npm run build
node --test tests/tasks.test.cjs tests/location-history.test.cjs
```

HTTP tests use an isolated transactional database stub and cover authorization,
driver isolation, validation, idempotence, cancellation, completion, stale
revisions, rollback, and the missing-migration response. They do not execute DDL
against a live MySQL server. Test the migration and query plans on a matching
staging database before production rollout.
