#!/usr/bin/python3
"""Back up the application database, then run the compiled migration CLI as its user."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path('/opt/peik-deploy')
BACKUPS = Path('/var/lib/peik-deploy/database-backups')
HELPERS = Path('/usr/local/libexec/peik-deploy')
NODE = ROOT / 'node/bin/node'


def command(argv, timeout=60, **kwargs):
    process = subprocess.Popen([str(arg) for arg in argv], start_new_session=True, **kwargs)
    try:
        out, err = process.communicate(timeout=timeout)
    except BaseException:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        raise
    if process.returncode:
        diagnostic = BACKUPS.parent / 'migration-last-error.log'
        if err:
            diagnostic.write_bytes(err if isinstance(err, bytes) else err.encode())
            os.chmod(diagnostic, 0o600)
        raise RuntimeError('Database operation failed: ' + Path(str(argv[0])).name
                           + '; details: ' + str(diagnostic))
    return out


def cli(backend, *arguments):
    return ['/usr/sbin/runuser', '-u', 'peikydsp', '--', '/usr/bin/env', '-i',
            'PATH=/opt/peik-deploy/node/bin:/usr/bin:/bin', 'NODE_ENV=production',
            'DOTENV_CONFIG_PATH=/opt/peik-deploy/shared/backend.env',
            'DOTENV_CONFIG_QUIET=true',
            NODE, backend / 'dist/scripts/migrate.js', *arguments]


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r') + '"'


def backup(backend, plan):
    config = json.loads(command(['/usr/sbin/runuser', '-u', 'peikydsp', '--', NODE,
        HELPERS / 'database-config.cjs', backend], stdout=subprocess.PIPE, stderr=subprocess.PIPE))
    if set(config) != {'host', 'port', 'user', 'password', 'database'} or any('\0' in str(value) for value in config.values()):
        raise ValueError('Invalid database configuration')
    if not str(config['port']).isdigit():
        raise ValueError('Invalid database port')
    dump = shutil.which('mariadb-dump') or shutil.which('mysqldump')
    if not dump:
        raise RuntimeError('Database dump utility unavailable')
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target = BACKUPS / (stamp + '-' + backend.parent.name + '.sql.gz')
    raw = target.with_suffix('.partial')
    fd, name = tempfile.mkstemp(prefix='.migration-db-', dir=str(ROOT / 'shared'))
    try:
        os.fchown(fd, 0, pwd.getpwnam('peikydsp').pw_gid)
        os.fchmod(fd, 0o640)
        with os.fdopen(fd, 'w') as settings:
            settings.write('[client]\n' + ''.join(key + '=' + quote(config[key]) + '\n'
                for key in ('host', 'port', 'user', 'password')))
        with raw.open('xb') as output:
            command(['/usr/sbin/runuser', '-u', 'peikydsp', '--', dump,
                '--defaults-extra-file=' + name, '--single-transaction', '--quick',
                '--routines', '--events', '--triggers', '--hex-blob', '--skip-lock-tables',
                '--', config['database']], timeout=120, stdout=output, stderr=subprocess.PIPE)
            output.flush()
            os.fsync(output.fileno())
        digest = hashlib.sha256()
        size = 0
        with raw.open('rb') as source, target.open('xb') as output:
            with gzip.GzipFile(fileobj=output, mode='wb', mtime=0) as compressed:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk: break
                    digest.update(chunk)
                    size += len(chunk)
                    compressed.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        verified = hashlib.sha256()
        with gzip.open(target, 'rb') as source:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk: break
                verified.update(chunk)
        if not size or digest.digest() != verified.digest():
            raise RuntimeError('Database backup verification failed')
        target.with_suffix('.json').write_text(json.dumps({
            'release': backend.parent.name, 'created_at': stamp, 'sql_bytes': size,
            'sql_sha256': digest.hexdigest(), 'plan': plan,
        }, indent=2) + '\n')
        print('DATABASE_BACKUP_OK ' + str(target), flush=True)
    finally:
        Path(name).unlink(missing_ok=True)
        raw.unlink(missing_ok=True)
    return target


def migrate_release(backend):
    plan = json.loads(command(cli(backend, '--plan'), cwd=str(backend),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE))
    if plan['pending'] or plan['baseline']:
        backup(backend, plan)
    # The bounded unit terminates the worker if the SSH coordinator disappears.
    command(['systemd-run', '--quiet', '--wait', '--pipe', '--collect',
        '--unit=peik-deploy-migrations', '--property=User=peikydsp', '--property=Group=peikydsp',
        '--property=WorkingDirectory=' + str(backend), '--property=NoNewPrivileges=true',
        '--property=PrivateTmp=true', '--property=ProtectSystem=strict', '--property=ProtectHome=true',
        '--property=RuntimeMaxSec=240', '--property=TimeoutStopSec=10',
        '/usr/bin/env', '-i', 'PATH=/opt/peik-deploy/node/bin:/usr/bin:/bin', 'NODE_ENV=production',
        'DOTENV_CONFIG_PATH=/opt/peik-deploy/shared/backend.env', 'DOTENV_CONFIG_QUIET=true', NODE,
        backend / 'dist/scripts/migrate.js'], timeout=270)


if __name__ == '__main__':
    os.umask(0o077)
    try:
        if os.geteuid() != 0: raise ValueError('Run as root')
        backend = Path(sys.argv[1]).resolve(strict=True)
        if backend.name != 'backend' or backend.parent.parent != ROOT / 'releases':
            raise ValueError('Invalid backend path')
        migrate_release(backend)
    except Exception as error:
        print('MIGRATIONS_FAILED ' + str(error), flush=True)
        sys.exit(1)
