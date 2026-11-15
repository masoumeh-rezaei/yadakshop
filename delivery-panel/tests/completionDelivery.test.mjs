import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverCompletionOnce } from '../src/utils/completionDelivery.ts';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}
test('duplicate completion events emit each external alert only once per revision', async () => {
  const saved = storage(); let sounds = 0; let desktops = 0;
  const deliver = remaining => { if (remaining.sound) sounds++; if (remaining.desktop) desktops++; return remaining; };
  await Promise.all(Array.from({ length: 5 }, () => deliverCompletionOnce('duplicates', '12:2', deliver, saved)));
  assert.equal(sounds, 1); assert.equal(desktops, 1);
  await deliverCompletionOnce('duplicates', '12:4', deliver, saved);
  assert.equal(sounds, 2); assert.equal(desktops, 2);
});
test('an unarmed tab can show the desktop notification without consuming an armed tab sound', async () => {
  const saved = storage(); const targets = [];
  await deliverCompletionOnce('unarmed', '13:2', remaining => { targets.push(remaining); return { sound: false, desktop: true }; }, saved);
  await deliverCompletionOnce('unarmed', '13:2', remaining => { targets.push(remaining); return remaining; }, saved);
  assert.deepEqual(targets, [{ sound: true, desktop: true }, { sound: true, desktop: false }]);
});
test('blocked desktop permissions do not prevent independent sound delivery', async () => {
  const saved = storage();
  const first = await deliverCompletionOnce('blocked-desktop', '14:2', () => ({ sound: true, desktop: false }), saved);
  assert.deepEqual(first, { sound: true, desktop: false });
  await deliverCompletionOnce('blocked-desktop', '14:2', remaining => {
    assert.deepEqual(remaining, { sound: false, desktop: true }); return remaining;
  }, saved);
});
test('notifications delivered before the sound upgrade are not replayed', async () => {
  const saved = storage(); saved.setItem('legacy', JSON.stringify(['15:2']));
  await deliverCompletionOnce('legacy', '15:2', () => { assert.fail('Historical delivery must not replay'); }, saved);
});
test('storage failures retain in-memory deduplication and isolate administrator scopes', async () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  let calls = 0;
  const deliver = remaining => { calls++; return remaining; };
  await deliverCompletionOnce('private-admin-1', '16:2', deliver, blocked);
  await deliverCompletionOnce('private-admin-1', '16:2', deliver, blocked);
  await deliverCompletionOnce('private-admin-2', '16:2', deliver, blocked);
  assert.equal(calls, 2);
});
test('cross-tab lock operations re-read shared delivery state and retain a bounded ledger', async () => {
  const saved = storage(); let pending = Promise.resolve(); let calls = 0;
  const lock = (_name, action) => { const next = pending.then(action); pending = next.catch(() => {}); return next; };
  await Promise.all(Array.from({ length: 8 }, () => deliverCompletionOnce('locked', '17:2', remaining => { calls++; return remaining; }, saved, lock)));
  assert.equal(calls, 1);
  for (let id = 18; id < 230; id++) await deliverCompletionOnce('locked', `${id}:2`, remaining => remaining, saved, lock);
  assert.equal(JSON.parse(saved.getItem('locked')).length, 200);
});
test('unavailable locks fall back once without repeating partially executed deliveries', async () => {
  const saved = storage(); let calls = 0;
  await deliverCompletionOnce('lock-denied', '18:2', remaining => { calls++; return remaining; }, saved, async () => { throw new Error('Lock permission denied'); });
  assert.equal(calls, 1);
  await assert.rejects(deliverCompletionOnce('lock-action-error', '18:2', () => { calls++; throw new Error('Action failed'); }, saved, async (_name, action) => action()), /Action failed/);
  assert.equal(calls, 2);
});
