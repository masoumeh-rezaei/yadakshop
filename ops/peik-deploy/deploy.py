#!/usr/bin/python3
"""Receive a GitHub Actions artifact for current main. No polling and no production builds."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import urllib.error

INSTALL = Path('/opt/peik-deploy')
RELEASES = INSTALL / 'releases'
CURRENT = INSTALL / 'current'
STATE_DIR = Path('/var/lib/peik-deploy')
STATE = STATE_DIR / 'state.json'
PENDING = STATE_DIR / 'pending.json'
HELPERS = Path('/usr/local/libexec/peik-deploy')
NODE = INSTALL / 'node/bin/node'
ORIGIN = 'https://github.com/masoumeh-rezaei/yadakshop.git'
GIT = '/usr/local/cpanel/3rdparty/lib/path-bin/git'
API_SERVICE = 'peik-delivery-api.service'
SHA_PATTERN = re.compile(r'^[0-9a-f]{40}$')
JOURNAL = False

def now():
    return datetime.now(timezone.utc).isoformat()

def log(message):
    print(now() + ' ' + message, flush=True)
    if JOURNAL:
        subprocess.run(['/usr/bin/logger', '-t', 'peik-deploy', '--', message], check=False)

def atomic_json(path, value):
    fd, temporary = tempfile.mkstemp(dir=str(path.parent), prefix='.peik-state-')
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(value, output, sort_keys=True, indent=2)
            output.write('\n'); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def read_state():
    return json.loads(STATE.read_text())

def run(arguments, timeout=60, capture=False):
    result = subprocess.run([str(arg) for arg in arguments], timeout=timeout,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None,
                            text=True, check=False)
    if result.returncode:
        raise RuntimeError('Command failed: ' + Path(str(arguments[0])).name)
    return result.stdout.strip() if capture else ''

def release_path(name):
    if not re.fullmatch(r'(?:[0-9a-f]{40}|baseline-[0-9]{14})', name):
        raise ValueError('Invalid release name')
    path = RELEASES / name
    if path.is_symlink() or path.resolve().parent != RELEASES:
        raise ValueError('Invalid release path')
    return path

def migration_digest(backend):
    digest = hashlib.sha256()
    directory = backend / 'migrations'
    if directory.exists():
        for path in sorted(directory.rglob('*.sql')):
            if path.is_symlink(): raise ValueError('Migration symlink')
            digest.update(path.relative_to(directory).as_posix().encode())
            digest.update(b'\0'); digest.update(path.read_bytes()); digest.update(b'\0')
    return digest.hexdigest()

def unpack_artifact(fileobj, destination):
    """No links, traversal, special files, credentials, duplicate entries or unlimited expansion."""
    total = 0
    seen = set()
    with tarfile.open(fileobj=fileobj, mode='r:gz') as archive:
        for index, member in enumerate(archive):
            name = member.name.rstrip('/')
            path = PurePosixPath(name)
            if (index >= 20000 or path.is_absolute() or '..' in path.parts or '\\' in name
                    or not path.parts or name in seen):
                raise ValueError('Invalid archive path')
            seen.add(name)
            if path.parts[0] not in ('backend', 'panel'):
                raise ValueError('Unexpected archive root')
            if any(part == '.env' or part.startswith('.env.') or part == '.git' for part in path.parts):
                raise ValueError('Credential/config file in artifact')
            if not member.isdir() and not member.isfile():
                raise ValueError('Links and special files are not permitted')
            total += member.size
            if member.size > 32 * 1024 * 1024 or total > 256 * 1024 * 1024:
                raise ValueError('Artifact too large')
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
    for required in ('backend/dist/server.js', 'backend/package-lock.json', 'backend/node_modules', 'panel/index.html'):
        if not (destination / required).exists(): raise ValueError('Incomplete artifact')

def secure_release(path):
    group = pwd.getpwnam('peikydsp').pw_gid
    os.chmod(path, 0o755)
    for entry in path.rglob('*'):
        if entry.is_symlink(): raise ValueError('Release contains a symlink')
        private = entry.relative_to(path).parts[0] == 'backend'
        os.chown(entry, 0, group if private else 0)
        os.chmod(entry, (0o750 if private else 0o755) if entry.is_dir() else (0o640 if private else 0o644))

def remote_sha():
    output = run(['/usr/sbin/runuser', '-u', 'peikdeploy', '--', '/usr/bin/env', '-i',
                  'HOME=/var/lib/peik-upload', 'PATH=/usr/bin:/bin', 'GIT_CONFIG_NOSYSTEM=1',
                  'GIT_CONFIG_GLOBAL=/dev/null', 'GIT_TERMINAL_PROMPT=0', GIT,
                  '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=never',
                  'ls-remote', '--exit-code', ORIGIN, 'refs/heads/main'], timeout=45, capture=True)
    parts = output.split()
    if len(parts) != 2 or not SHA_PATTERN.fullmatch(parts[0]) or parts[1] != 'refs/heads/main':
        raise RuntimeError('Invalid main reference')
    return parts[0]

def receive_artifact(sha):
    with tempfile.TemporaryFile(dir=str(STATE_DIR)) as artifact:
        total = 0
        while True:
            block = sys.stdin.buffer.read(1024 * 1024)
            if not block: break
            total += len(block)
            if total > 96 * 1024 * 1024: raise ValueError('Upload too large')
            artifact.write(block)
        artifact.seek(0)
        staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=str(RELEASES)))
        try:
            unpack_artifact(artifact, staging)
            atomic_json(staging / 'release.json', {'sha': sha, 'built_at': now(), 'node': '22.14.0'})
            secure_release(staging)
            destination = release_path(sha)
            if destination.exists():
                shutil.rmtree(staging)
            else:
                os.rename(staging, destination)
            return destination
        except BaseException:
            if staging.exists(): shutil.rmtree(staging)
            raise

def set_current(path):
    temporary = INSTALL / ('.current-' + str(os.getpid()))
    try:
        temporary.symlink_to(path)
        os.replace(temporary, CURRENT)
    finally:
        if temporary.is_symlink(): temporary.unlink()

def publish(path):
    run(['/usr/sbin/runuser', '-u', 'peikydsp', '--', '/usr/bin/python3',
         str(HELPERS / 'publish.py'), str(path)], timeout=90)

def runtime_check(path, candidate=False):
    mode = 'candidate' if candidate else 'production'
    result = run(['/usr/sbin/runuser', '-u', 'peikydsp', '--', '/usr/bin/env', '-i',
         'PATH=/opt/peik-deploy/node/bin:/usr/bin:/bin', str(NODE),
         str(HELPERS / 'check-runtime.cjs'), str(path / 'backend'), mode], timeout=90, capture=True)
    log(result)
    if not candidate:
        pid = run(['systemctl', 'show', API_SERVICE, '--property=MainPID', '--value'], capture=True)
        if not pid.isdigit() or pid == '0' or Path('/proc/' + pid + '/cwd').resolve() != path / 'backend':
            raise RuntimeError('Unexpected running release')
        req = urllib.request.Request('https://peik.ydsp.ir/?peik_check=' + str(time.time_ns()), headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
        with urllib.request.urlopen(req, timeout=12) as response:
            body = response.read(1024 * 1024)
        if hashlib.sha256(body).digest() != hashlib.sha256((path / 'panel/index.html').read_bytes()).digest():
            raise RuntimeError('Public panel does not match release')

def wait_check(path, candidate=False):
    error = None
    for attempt in range(5):
        try:
            runtime_check(path, candidate)
            return
        except (RuntimeError, OSError, subprocess.TimeoutExpired, urllib.error.URLError) as exc:
            error = exc
            time.sleep(2)
    raise RuntimeError('Read-only release check failed') from error

def candidate_check(path):
    unit = 'peik-deploy-candidate.service'
    command = ['systemd-run', '--quiet', '--collect', '--unit=peik-deploy-candidate',
        '--property=User=peikydsp', '--property=Group=peikydsp',
        '--property=WorkingDirectory=' + str(path / 'backend'),
        '--property=NoNewPrivileges=true', '--property=PrivateTmp=true',
        '--property=ProtectSystem=strict', '--property=ProtectHome=true',
        '--property=MemoryMax=512M', '--property=TasksMax=128', '--property=RuntimeMaxSec=180',
        '/usr/bin/env', '-i', 'PATH=/opt/peik-deploy/node/bin:/usr/bin:/bin', 'PORT=3001',
        'NODE_ENV=production', 'DOTENV_CONFIG_PATH=/opt/peik-deploy/shared/backend.env',
        str(NODE), '--require=' + str(HELPERS / 'candidate.cjs'), 'dist/server.js']
    try:
        run(command)
        wait_check(path, candidate=True)
        log('CANDIDATE_OK ' + path.name)
    finally:
        subprocess.run(['systemctl', 'stop', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def restore(transaction):
    old = release_path(transaction['old_release'])
    set_current(old)
    publish(old)
    run(['systemctl', 'restart', API_SERVICE], timeout=100)
    wait_check(old)
    atomic_json(STATE, transaction['old_state'])
    PENDING.unlink(missing_ok=True)
    log('ROLLBACK_OK ' + old.name)

def activate(path, state, hold_main=False):
    transaction = {'old_release': state['current_release'], 'new_release': path.name, 'old_state': state.copy()}
    atomic_json(PENDING, transaction)
    try:
        set_current(path)
        publish(path)
        run(['systemctl', 'restart', API_SERVICE], timeout=100)
        wait_check(path)
        metadata = json.loads((path / 'release.json').read_text())
        state.update(previous_release=transaction['old_release'], current_release=path.name,
                     current_sha=metadata['sha'], migration_digest=migration_digest(path / 'backend'),
                     last_success=now(), last_error=None, failed_sha=None, failed_at=None,
                     held_sha=transaction['old_state']['current_sha'] if hold_main else None)
        atomic_json(STATE, state)
        PENDING.unlink(missing_ok=True)
        log('DEPLOY_OK ' + metadata['sha'])
    except BaseException:
        log('ACTIVATION_FAILED restoring previous release')
        restore(transaction)
        raise

def receive(sha):
    state = read_state()
    try:
        if not SHA_PATTERN.fullmatch(sha) or remote_sha() != sha:
            raise RuntimeError('Artifact must name the current GitHub main commit')
        state.update(last_check=now(), last_remote_sha=sha)
        if sha == state.get('held_sha'):
            raise RuntimeError('Commit held after manual rollback; root must resume this exact SHA')
        atomic_json(STATE, state)
        path = receive_artifact(sha)
        changed = migration_digest(path / 'backend') != state['migration_digest']
        if changed and state.get('approved_schema_sha') != sha:
            raise RuntimeError('Migration files changed: manual database review required before approve-schema')
        candidate_check(path)
        # Never publish an obsolete build when main changes while it is being built.
        if remote_sha() != sha:
            raise RuntimeError('Main changed during upload; deploy the newer workflow run')
        if state['current_release'] == path.name:
            wait_check(path)
            state.update(last_error=None, last_success=now())
            atomic_json(STATE, state)
            log('ALREADY_DEPLOYED ' + sha)
            return
        activate(path, state)
    except Exception as error:
        state = read_state()
        state.update(last_error=str(error), last_check=now())
        if sha: state.update(failed_sha=sha, failed_at=time.time())
        atomic_json(STATE, state)
        log('DEPLOY_FAILED ' + str(error))
        raise

def main():
    global JOURNAL
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['receive', 'status', 'rollback', 'approve-schema', 'resume'])
    parser.add_argument('sha', nargs='?')
    args = parser.parse_args()
    if os.geteuid() != 0: raise SystemExit('Run as root')
    JOURNAL = True
    STATE_DIR.mkdir(mode=0o700, exist_ok=True)
    with (STATE_DIR / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if PENDING.exists():
            log('RECOVER interrupted activation')
            restore(json.loads(PENDING.read_text()))
        if args.command == 'status': print(json.dumps(read_state(), indent=2)); return
        if args.command in ('approve-schema', 'resume'):
            if not args.sha or not SHA_PATTERN.fullmatch(args.sha) or remote_sha() != args.sha:
                raise ValueError('Approval must name current main SHA')
            state = read_state()
            if args.command == 'approve-schema': state['approved_schema_sha'] = args.sha
            else: state['held_sha'] = None
            atomic_json(STATE, state)
            log('REVIEW_RECORDED no SQL was executed; rerun the GitHub workflow when ready')
            return
        if args.command == 'rollback':
            state = read_state()
            if not state.get('previous_release'): raise RuntimeError('No previous release')
            path = release_path(state['previous_release'])
            candidate_check(path)
            activate(path, state, hold_main=True)
            return
        if not args.sha: raise ValueError('Missing commit SHA')
        receive(args.sha)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        log('ERROR ' + str(error)); sys.exit(1)
