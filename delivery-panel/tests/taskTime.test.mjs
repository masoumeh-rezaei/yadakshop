import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTaskTimestamp, taskElapsed } from '../src/utils/taskTime.ts';
import { taskElapsed as appElapsed, formatTaskTimestamp as appTimestamp } from '../../delivery-app/src/utils/task-time.ts';
import { destinationLink, validDestination } from '../../delivery-app/src/utils/destination-links.ts';
import { taskMapUrl } from '../../delivery-app/src/utils/task-map-url.ts';
import { readCompletionNotice, completionKey } from '../src/hooks/useTaskNotifications.ts';

test('task dates use Tehran time, Persian calendar, and seconds on both clients', () => {
  const value = '2026-11-12T08:51:32Z';
  const text = formatTaskTimestamp(value);
  assert.match(text, /۱۲:۲۱:۳۲/);
  assert.match(text, /۱۴۰۵/);
  assert.equal(text, appTimestamp(value));
});
test('elapsed time retains hours and remaining minutes, clamps future dates and handles invalid values', () => {
  const time = '2026-11-12T08:00:00Z';
  const now = Date.parse(time);
  for (const elapsed of [taskElapsed, appElapsed]) {
    assert.equal(elapsed(time, now + (2 * 60 + 3) * 60_000), '۲ ساعت و ۳ دقیقه');
    assert.equal(elapsed(time, now + 30 * 60_000), '۳۰ دقیقه');
    assert.equal(elapsed(time, now + 60 * 60_000), '۱ ساعت');
    assert.equal(elapsed(time, now + (1440 + 123) * 60_000), '۱ روز و ۲ ساعت و ۳ دقیقه');
    assert.equal(elapsed(time, now - 60_000), 'کمتر از یک دقیقه');
    assert.equal(elapsed('invalid', now), 'زمان نامشخص');
  }
});
test('Neshan links preserve latitude/longitude order and reject invalid coordinates', () => {
  const point = { latitude: 35.6892, longitude: 51.389 };
  assert.equal(destinationLink(point), 'https://nshn.ir/?lat=35.6892&lng=51.389');
  assert.equal(destinationLink(point, true), 'neshan://?ll=35.6892,51.389');
  assert.equal(validDestination({ latitude: 91, longitude: 0 }), false);
  assert.throws(() => destinationLink({ latitude: NaN, longitude: 51 }));
});

test('local map uses Vite while deployed map and explicit configuration retain their correct origin', () => {
  assert.equal(taskMapUrl('http://10.0.2.2:3000', true), 'http://10.0.2.2:5173/driver-map.html');
  assert.equal(taskMapUrl('https://peik.ydsp.ir', false), 'https://peik.ydsp.ir/driver-map.html');
  assert.equal(taskMapUrl('http://localhost:3000', true, 'http://localhost:5176/driver-map.html'), 'http://localhost:5176/driver-map.html');
});

test('completion notices reject malformed events and identify each completed revision separately', () => {
  const task = { id: 2, revision: 4, driverName: 'پیک', driverPhone: '', placeName: 'مقصد', completedAt: '2026-11-12T08:00:00Z' };
  assert.deepEqual(readCompletionNotice(task), task);
  assert.equal(completionKey(task), '2:4');
  assert.notEqual(completionKey(task), completionKey({ ...task, revision: 6 }));
  for (const invalid of [null, {}, { ...task, revision: -1 }, { ...task, id: '2' }, { ...task, completedAt: 'invalid' }, { ...task, placeName: {} }]) {
    assert.equal(readCompletionNotice(invalid), null);
  }
});
