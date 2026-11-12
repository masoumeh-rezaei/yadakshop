import test from 'node:test';
import assert from 'node:assert/strict';
import { locationTime } from '../src/utils/locationTime.ts';

test('driver lists share Tehran dates independently of the browser timezone', () => {
  const date = '2026-10-28T08:51:00Z';
  const expected = new Date(date).toLocaleString('fa-IR', {
    timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric',
  });
  assert.equal(locationTime(date), expected);
});

test('recent location timestamps retain second and minute precision', (context) => {
  context.mock.method(Date, 'now', () => Date.parse('2026-11-12T10:00:00Z'));
  assert.equal(locationTime(new Date(Date.now() - 12_000).toISOString()), '12 ثانیه پیش');
  assert.equal(locationTime(new Date(Date.now() - 6 * 60_000).toISOString()), '6 دقیقه پیش');
  assert.equal(locationTime('invalid'), 'زمان نامشخص');
});
