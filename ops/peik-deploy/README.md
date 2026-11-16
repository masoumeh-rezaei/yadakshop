# Peik production deployment

Changes pushed or merged to `main` run `.github/workflows/deploy-peik.yml`.
Pull requests run build/security checks only. Production deployment has no approval
step after merge. Both the workflow condition and server receiver restrict
deployment to the original repository's current `main` commit.

The build job uses Node 22.14.0, `npm ci` with lifecycle scripts disabled, compiles
both application directories, and packages Linux production dependencies. The
frontend is built with `VITE_API_URL=https://peik.ydsp.ir`. Backend secrets stay on
the server. The mobile `delivery-app` release is independent.

The deploy job downloads only its own build artifact, verifies its checksum, and
uses a dedicated SSH key. Actions are pinned to reviewed commit SHAs. The build
job has no deployment secrets. No GitHub runner is installed on the WHM server.

## Backend selection

`.github/peik-release.json` now uses `backendRef: null`, so each release includes
the current backend and its compiled migration runner. `backend/release-source.json`
records both source commits. The optional ancestor pin is retained for recovery;
a backend predating the tracked migration runner cannot use automatic migration.

## Server boundary

The SSH account `peikdeploy` accepts `probe` and `deploy <40-character SHA>` only.
It cannot open an interactive shell, forward ports, read the backend environment,
or run general root commands. Its only sudo grant calls the fixed receiver.
Root checks that the SHA is current GitHub `main` and extracts a bounded artifact
without links, traversal, credentials, special files or duplicate entries.
Application code runs as `peikydsp`, never as root.

Releases and the current pointer are root-owned under `/opt/peik-deploy`.
The runtime is the official Node 22.14.0 distribution checked against its pinned
SHA-256. The application environment is `/opt/peik-deploy/shared/backend.env`
with mode 640 and access limited to root and the application group.

After migrations and before promotion, a candidate binds to loopback port 3001.
Its background push worker is disabled. Read-only checks cover
the expected tables, health, authenticated API reads, authenticated Socket.IO,
and rejection of an unauthenticated socket. No rows are created or changed.

Promotion changes the current release, publishes assets before the HTML entry
point, and restarts only `peik-delivery-api.service`. Existing cPanel configuration
and `.well-known` remain intact; old hashed assets remain available. Post-deploy
checks cover public HTTPS/API/Socket.IO, the actual process working directory,
and the published HTML. Failure restores the previous code and panel. An
interrupted activation is recovered from a root-owned transaction journal on
the next deployment or status command.
SSH output failure cannot interrupt recovery. Hangup/termination signals enter
the rollback path, and recovery shields itself from repeated termination signals.
A hard process kill or host failure still requires the saved journal to be
recovered by the next deployment/status invocation.

Deployment is serialized by GitHub concurrency and a server lock. An obsolete
commit is rejected if `main` has moved. A single backend restart disconnects
existing sockets briefly; this design does not promise zero downtime.

## Operations

Use these commands as root:

```sh
peik-deploy status
journalctl -t peik-deploy --since today
peik-deploy rollback
```

Manual rollback holds the failed main SHA so an automatic rerun cannot undo the
rollback. After resolving the problem, push a new commit; or explicitly allow
that exact current SHA and rerun the GitHub workflow:

```sh
peik-deploy resume <current-main-SHA>
```

Every deployment invokes the compiled migration runner before candidate startup
or promotion. The runner applies pending SQL files in numeric order and records
their SHA-256 checksums in `peik_schema_migrations`. Repeat deployments skip
applied files. Changed/deleted applied files and unfinished/failed migrations
stop deployment. A database advisory lock also serializes manual migration runs.
Existing migrations 001/002 are baselined only after checking their table columns
and unique indexes, preserving saved-place edits instead of replaying the seed.

Before pending SQL or initial baselining, `migrations.py` dumps this application's
database with `--single-transaction`, including routines, events and triggers.
It verifies the compressed SQL against its SHA-256 before allowing migration.
Root-only backups and metadata are retained under
`/var/lib/peik-deploy/database-backups/`; monitor their size and retain recovery
copies before pruning them. A failed dump or migration leaves the active code
and panel untouched. Application SQL runs as `peikydsp` with bounded lock waits
and a four-minute transient systemd unit, never as root. No compiler or npm
installation is needed on production. `create-admin` remains manual.

MySQL/MariaDB DDL commits implicitly: partial schema changes cannot be undone by
the runner. Inspect a failed/running entry and its backup before an explicit
`node dist/scripts/migrate.js --retry <exact-filename>` from that backend directory
with `DOTENV_CONFIG_PATH=/opt/peik-deploy/shared/backend.env`, as `peikydsp`.
Write additive migrations compatible with the currently running backend. Code
rollback restores code/panel only; it never restores a live database or erases
concurrent user writes. `approve-schema` remains a legacy bookkeeping command
and is no longer required for normal deployment.

The courier history feature uses the existing database schema. Its optional
index tuning script is documented in `delivery-backend/maintenance/README.md`
and is not a required migration or included in the application artifact. Moving
this performance-only operation out of required migrations restores the same
migration fingerprint as the pre-history release. Database latency should be
assessed separately for large location tables. Required migrations run through
the backed-up, tracked deployment path described above.

The original service definition and a baseline release are retained. The
original backend directory remains available for recovery. Deployment helper
changes in this directory require a separate reviewed server installation;
an application artifact cannot overwrite the privileged helper or systemd unit.

## GitHub configuration

The workflow records deployments in the `production` environment. Configure
these repository Actions secrets, or environment secrets if the repository owner
has configured the environment:

- `PEIK_DEPLOY_KEY`: the dedicated private SSH key.
- `PEIK_KNOWN_HOSTS`: the verified SSH host key for `[87.107.0.98]:19322`.

Repository administrators should protect `main`, require the `Build and verify`
check and reviewed pull requests, and prevent force pushes/deletion. Review
changes to `.github/workflows`, `.github/scripts`, and this directory carefully.
The owner can additionally restrict the `production` environment to branch
`main` and move the secrets there. Environment configuration in a personal
repository requires the repository owner; collaborator write access is enough
to manage repository Actions secrets. All repository writers must be trusted
application deployers while repository secrets are in use.

Keep several recent releases for recovery. Assets are intentionally retained;
remove obsolete releases/assets only after assessing active clients and rollback
needs. Check deployment logs when a run fails; do not bypass the health or
migration gates to force publication.
