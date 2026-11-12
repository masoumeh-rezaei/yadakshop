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

Administrators can list tasks and assign/cancel pairs. Only the assigned driver
can complete a task; the app asks for confirmation before sending the request. Drivers
use `/api/tasks/mine`, whose driver ID comes exclusively from authentication.
Drivers cannot list all tasks or change assignments and can complete only their
own tasks. Every request checks the user's current active status. Authenticated
sockets join server-selected administrator or individual-courier rooms. A task
change invalidates the assigned courier's list immediately. The app reconnects
and reconciles on resuming, polls every five seconds while disconnected, and
performs a one-minute reconciliation while connected. It also has a manual
refresh button. Courier sockets never receive fleet locations or other
couriers' completion details; disabled/deleted accounts are disconnected.

Completion emits one administrator event after commit, including the exact
completion timestamp. Retried completion requests do not repeat the event.
The panel also detects completed revisions during reconciliation after a
disconnect. Its notification inbox is available throughout the panel. The bell
button requests browser permission for system notifications on HTTPS/localhost;
the admin tab may be in the background but must remain open. This is not a
service-worker/web-push implementation for closed browser tabs.

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

Existing installations with the task table must also apply `003_add_task_description.sql`
and `004_create_push_notifications.sql` in order, targeting only missing migrations.
`003` adds nullable instructions. `004` creates authenticated device registrations
and the durable, per-device `task_push_jobs` outbox. Both can be rerun without
changing existing tasks. The health endpoint requires all of these columns/tables.

An assignment and its push jobs commit in the same transaction. Duplicate
assignment retries do not add jobs. A bounded worker claims jobs with a lease,
retries temporary transport/provider failures with backoff, checks Expo delivery
receipts after 15 minutes, and removes unregistered devices. Cancelled/stale tasks,
inactive couriers, and devices moved to another account are skipped. Push delivery
uses Expo's HTTPS API, optional server-only `EXPO_ACCESS_TOKEN`, high-priority
`tasks` channel, and per-task notification tags to replace duplicates. Push
provider acceptance is not a guarantee that a device displayed the notification.

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

A new Android build is needed for the notification/storage dependencies and
keyboard resize configuration. Configure Firebase/FCM as described in
[`delivery-app/README.md`](../delivery-app/README.md) before expecting notifications
while the app is closed. No Firebase credentials are supplied by this repository. The
existing GitHub deployment publishes the web/backend only; it does not install
a new APK on a driver's device.

## Checks

```sh
npm run build
node --test tests/*.test.cjs
```

HTTP tests use an isolated transactional database stub and cover authorization,
driver isolation, validation, idempotence, cancellation, completion, stale
revisions, rollback, and the missing-migration response. They do not execute DDL
against a live MySQL server. Test the migration and query plans on a matching
staging database before production rollout.
