import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistoryRange, FULL_DAY, formatHistoryDay, formatHistoryTime, historyDayKey, nearestHistoryHandle, rangeTimestamp, resizeHistoryRange } from '../src/utils/historyTime.ts';
import { buildTimelineSegments, prepareRouteHistory } from '../src/utils/routeHistory.ts';

test('Tehran midnight groups records independently of the browser timezone', () => {
  assert.equal(historyDayKey('2026-11-04T20:29:59Z'), '2026-11-04');
  assert.equal(historyDayKey('2026-11-04T20:30:00Z'), '2026-11-05');
});

test('Persian dates include the day, month and year', () => {
  assert.equal(formatHistoryDay('2026-10-25'), '۳ آبان ۱۴۰۵');
  assert.equal(formatHistoryTime(720), '۱۲:۰۰');
  assert.equal(formatHistoryTime(1440), '۲۴:۰۰');
});

test('noon to midnight uses Tehran time, including historical DST', () => {
  assert.equal(new Date(rangeTimestamp('2026-11-05', 720)).toISOString(), '2026-11-05T08:30:00.000Z');
  assert.equal(new Date(rangeTimestamp('2026-11-05', 1440)).toISOString(), '2026-11-05T20:30:00.000Z');
  assert.equal(new Date(rangeTimestamp('2021-07-01', 720)).toISOString(), '2021-07-01T07:30:00.000Z');
  assert.equal(new Date(rangeTimestamp('2021-03-21', 1440)).toISOString(), '2021-03-21T20:30:00.000Z');
});

test('range includes its start and excludes the next midnight and unrelated days', () => {
  const points = [
    ['before', '2026-11-05T08:29:59Z'], ['start', '2026-11-05T08:30:00Z'],
    ['last', '2026-11-05T20:29:59Z'], ['next-day', '2026-11-05T20:30:00Z'],
  ].map(([id, recordedAt]) => ({ id, recordedAt }));
  assert.deepEqual(filterHistoryRange(points, '2026-11-05', [720, 1440]).map((point) => point.id), ['start', 'last']);
  assert.deepEqual(filterHistoryRange(points, '2026-11-05', [800, 900]), []);
});

test('selecting a full day includes morning records and excludes the next midnight', () => {
  assert.deepEqual(FULL_DAY, [0, 1440]);
  const points = [
    ['before', '2026-11-04T20:29:59.999Z'], ['midnight', '2026-11-04T20:30:00Z'],
    ['morning', '2026-11-05T04:30:00Z'], ['noon', '2026-11-05T08:30:00Z'],
    ['last', '2026-11-05T20:29:59.999Z'], ['next', '2026-11-05T20:30:00Z'],
  ].map(([id, recordedAt]) => ({ id, recordedAt }));
  assert.deepEqual(filterHistoryRange(points, '2026-11-05', FULL_DAY).map((point) => point.id),
    ['midnight', 'morning', 'noon', 'last']);
});

test('whole-day boundaries include historical short and long Tehran days', () => {
  assert.equal(new Date(rangeTimestamp('2021-03-22', 0)).toISOString(), '2021-03-21T20:30:00.000Z');
  assert.equal(rangeTimestamp('2021-03-22', 1440) - rangeTimestamp('2021-03-22', 0), 23 * 3_600_000);
  assert.equal(rangeTimestamp('2021-09-21', 1440) - rangeTimestamp('2021-09-21', 0), 25 * 3_600_000);
});

test('track gestures choose the nearest handle inside and outside the selection', () => {
  for (const minute of [0, 300, 600, 720]) assert.equal(nearestHistoryHandle([600, 840], minute), 0);
  for (const minute of [721, 800, 1000, 1440]) assert.equal(nearestHistoryHandle([600, 840], minute), 1);
  assert.equal(nearestHistoryHandle(FULL_DAY, 360), 0);
  assert.equal(nearestHistoryHandle(FULL_DAY, 1080), 1);
});

test('resizing one handle preserves the other and clamps to day bounds without crossing', () => {
  assert.deepEqual(resizeHistoryRange([600, 840], 0, 300), [300, 840]);
  assert.deepEqual(resizeHistoryRange([600, 840], 1, 1000), [600, 1000]);
  assert.deepEqual(resizeHistoryRange([600, 840], 0, 1000), [839, 840]);
  assert.deepEqual(resizeHistoryRange([600, 840], 1, 300), [600, 601]);
  assert.deepEqual(resizeHistoryRange([600, 840], 0, -100), [0, 840]);
  assert.deepEqual(resizeHistoryRange([600, 840], 1, 1500), [600, 1440]);
  assert.deepEqual(resizeHistoryRange([600, 840], 0, 500.6), [501, 840]);
});

test('range filtering preserves the existing chronological light-to-dark route', () => {
  const points = [0, 1, 2, 3].map((index) => ({
    id: index, userId: 2, phone: '', fullName: null, accuracy: 5,
    latitude: 35.68 + index * .002, longitude: 51.38 + (index % 2) * .002,
    recordedAt: new Date(rangeTimestamp('2026-11-05', 720 + index * 60)).toISOString(),
  }));
  const filtered = filterHistoryRange(points.reverse(), '2026-11-05', [720, 900]);
  const route = prepareRouteHistory(filtered);
  assert.equal(route.length, 3);
  const segments = buildTimelineSegments(route);
  assert.equal(segments.length, 2);
  assert.notEqual(segments[0].color, segments[1].color);
  assert.equal(segments[1].color, 'rgb(29, 78, 216)');
  assert.deepEqual(segments[0].positions[0], [35.68, 51.38]);
});
