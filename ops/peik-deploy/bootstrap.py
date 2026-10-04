#!/usr/bin/python3
"""One-time snapshot. Does not restart production or run database writes."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import stat
import sys
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('deploy', '/usr/local/libexec/peik-deploy/deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
uid = pwd.getpwnam('peikydsp').pw_uid
gid = pwd.getpwnam('peikydsp').pw_gid

if deploy.STATE.exists():
    print('BASELINE_ALREADY_EXISTS'); sys.exit(0)
sha = sys.argv[1]
if not deploy.SHA_PATTERN.fullmatch(sha): raise ValueError('Invalid baseline SHA')
live = Path('/home/peikydsp/apps/delivery-backend')
public = Path('/home/peikydsp/public_html')
for path in (live, public):
    if path.is_symlink() or path.resolve() != path: raise ValueError('Unexpected live path')
shared = deploy.INSTALL / 'shared'
shared.mkdir(mode=0o750, exist_ok=True)
os.chown(shared, 0, gid)
fd = os.open(live / '.env', os.O_RDONLY | os.O_NOFOLLOW)
with os.fdopen(fd, 'rb') as source:
    info = os.fstat(source.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_size > 65536:
        raise ValueError('Unexpected environment file')
    with (shared / 'backend.env').open('xb') as destination:
        shutil.copyfileobj(source, destination)
os.chown(shared / 'backend.env', 0, gid)
os.chmod(shared / 'backend.env', 0o640)
baseline = deploy.RELEASES / ('baseline-' + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))
(baseline / 'backend').mkdir(parents=True)
(baseline / 'panel').mkdir()
for name in ('dist', 'node_modules', 'migrations', 'package.json', 'package-lock.json'):
    source = live / name
    if source.is_symlink(): raise ValueError('Unexpected live symlink')
    if source.is_dir():
        shutil.copytree(source, baseline / 'backend' / name, symlinks=True,
                        ignore=lambda directory, names: [name for name in names if name in ('.bin', '.env') or name.startswith('.env.')])
    elif source.is_file(): shutil.copy2(source, baseline / 'backend' / name)
for name in ('index.html', 'assets'):
    source = public / name
    if source.is_symlink(): raise ValueError('Unexpected panel symlink')
    if source.is_dir(): shutil.copytree(source, baseline / 'panel' / name, symlinks=True)
    else: shutil.copy2(source, baseline / 'panel' / name)
deploy.atomic_json(baseline / 'release.json', {'sha': sha, 'built_at': deploy.now(), 'node': '22.14.0', 'baseline': True})
deploy.secure_release(baseline)
deploy.set_current(baseline)
(deploy.STATE_DIR / 'bootstrap').mkdir(mode=0o700, exist_ok=True)
shutil.copy2('/etc/systemd/system/peik-delivery-api.service', deploy.STATE_DIR / 'bootstrap/peik-delivery-api.service')
deploy.atomic_json(deploy.STATE, {'current_release': baseline.name, 'current_sha': sha,
    'previous_release': None, 'migration_digest': deploy.migration_digest(baseline / 'backend'),
    'last_check': None, 'last_remote_sha': None, 'last_success': None, 'last_error': None,
    'failed_sha': None, 'failed_at': None, 'held_sha': None})
print('BASELINE_OK ' + baseline.name)
