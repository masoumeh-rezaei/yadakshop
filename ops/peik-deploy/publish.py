#!/usr/bin/python3
"""Publish as the cPanel account, never as root. Preserve cPanel files and old assets."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import sys
import tempfile

ROOT = Path('/opt/peik-deploy/releases')
PUBLIC = Path('/home/peikydsp/public_html')

def atomic(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix='.peik-publish-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def publish(release):
    if os.getuid() != pwd.getpwnam('peikydsp').pw_uid:
        raise RuntimeError('Publishing must run as peikydsp')
    release = Path(release).resolve()
    if release.parent != ROOT or not release.is_dir():
        raise ValueError('Invalid release')
    if PUBLIC.is_symlink() or PUBLIC.resolve() != PUBLIC:
        raise ValueError('Public directory is a symlink')
    panel = release / 'panel'
    files = sorted(panel.rglob('*'))
    for source in files:
        relative = source.relative_to(panel)
        if any(part.startswith('.') for part in relative.parts) or source.is_symlink():
            raise ValueError('Invalid panel path')
        destination = PUBLIC / relative
        for parent in [destination, *destination.parents]:
            if parent == PUBLIC.parent:
                break
            if parent.is_symlink():
                raise ValueError('Symlink in publication path')
        if source.is_dir():
            destination.mkdir(exist_ok=True, mode=0o755)
        elif relative.as_posix() != 'index.html':
            content = source.read_bytes()
            # Vite hashes asset names; retain the old version instead of overwriting a collision.
            if destination.exists() and relative.parts[0] == 'assets':
                if hashlib.sha256(destination.read_bytes()).digest() != hashlib.sha256(content).digest():
                    raise ValueError('Asset filename collision')
            else:
                atomic(destination, content)
    metadata = json.loads((release / 'release.json').read_text())
    atomic(PUBLIC / 'index.html', (panel / 'index.html').read_bytes())
    atomic(PUBLIC / 'peik-version.json', json.dumps({'commit': metadata['sha'], 'release': release.name}).encode() + b'\n')
    print('PUBLISH_OK ' + release.name)

if __name__ == '__main__':
    publish(sys.argv[1])
