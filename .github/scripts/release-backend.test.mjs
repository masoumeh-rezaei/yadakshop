import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { selectBackend } from './release-backend.mjs';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'peik-release-test-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Release test', '-c', 'user.email=release@example.invalid', ...args], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q');
    writeFileSync(join(root, 'example'), 'baseline'); git('add', 'example'); git('commit', '-qm', 'baseline');
    const baseline = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'example'), 'current'); git('add', 'example'); git('commit', '-qm', 'current');
    const current = git('rev-parse', 'HEAD');
    mkdirSync(join(root, '.github'));
    const configure = value => writeFileSync(join(root, '.github/peik-release.json'), JSON.stringify(value));
    run({ root, git, baseline, current, configure });
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(basename(root), /^peik-release-test-/);
    rmSync(root, { recursive: true, force: true });
  }
}

test('normal releases package the current backend when no pin is configured', () => fixture(({ root, current, configure }) => {
  assert.equal(selectBackend(root, current), current);
  configure({ backendRef: null, reason: 'Production database prepared.' });
  assert.equal(selectBackend(root, current), current);
}));
test('panel releases can retain an exact ancestor backend with an explicit reason', () => fixture(({ root, baseline, current, configure }) => {
  configure({ backendRef: baseline, reason: 'Pending production database preparation.' });
  assert.equal(selectBackend(root, current), baseline);
}));
test('branch names, remote URLs, invalid hashes and unexplained pins are rejected', () => fixture(({ root, baseline, current, configure }) => {
  for (const config of [{ backendRef: 'main', reason: 'pin' }, { backendRef: 'https://example.invalid', reason: 'pin' }, { backendRef: 'a'.repeat(40), reason: 'pin' }, { backendRef: baseline, reason: '' }, { backendRef: baseline, reason: 'pin', skipHealth: true }]) {
    configure(config); assert.throws(() => selectBackend(root, current));
  }
}));
test('valid commits outside the release history are rejected', () => fixture(({ root, git, current, configure }) => {
  const unrelated = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-m', 'unrelated');
  configure({ backendRef: unrelated, reason: 'Invalid unrelated backend.' });
  assert.throws(() => selectBackend(root, current), /ancestor/);
}));
test('release selection rejects non-commit release identifiers', () => fixture(({ root }) => {
  assert.throws(() => selectBackend(root, 'main'), /exact commit/);
}));
