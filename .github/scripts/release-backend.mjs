import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const commit = /^[0-9a-f]{40}$/;
export function selectBackend(root, releaseSha) {
  if (!commit.test(releaseSha)) throw new Error('Release must name an exact commit.');
  const filename = resolve(root, '.github/peik-release.json');
  if (!existsSync(filename)) return releaseSha;
  const config = JSON.parse(readFileSync(filename, 'utf8'));
  if (!config || Array.isArray(config) || typeof config !== 'object'
    || Object.keys(config).some(key => !['backendRef', 'reason'].includes(key))) {
    throw new Error('Unexpected release configuration.');
  }
  if (config.backendRef === null) return releaseSha;
  if (!commit.test(config.backendRef) || typeof config.reason !== 'string' || !config.reason.trim()) {
    throw new Error('A backend pin requires an exact commit and a reason.');
  }
  try {
    const type = execFileSync('git', ['cat-file', '-t', config.backendRef], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (type !== 'commit') throw new Error('Not a commit.');
    execFileSync('git', ['merge-base', '--is-ancestor', config.backendRef, releaseSha], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw new Error('Pinned backend must be an ancestor commit of this release.'); }
  return config.backendRef;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(selectBackend(resolve(process.argv[2]), process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
