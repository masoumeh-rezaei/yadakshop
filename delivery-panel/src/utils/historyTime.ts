export type TimeRange = [number, number];
export const FULL_AFTERNOON: TimeRange = [12 * 60, 24 * 60];
export const HISTORY_TIME_ZONE = 'Asia/Tehran';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: HISTORY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const persianDate = new Intl.DateTimeFormat('fa-IR', {
  timeZone: HISTORY_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric',
});

export function historyDayKey(timestamp: string | number): string {
  const parts = dayFormatter.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone: HISTORY_TIME_ZONE, timeZoneName: 'longOffset' });

export function rangeTimestamp(day: string, minute: number): number {
  const wallTime = Date.parse(`${day}T00:00:00Z`) + minute * 60_000;
  let timestamp = wallTime;
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = offsetFormatter.formatToParts(timestamp).find((part) => part.type === 'timeZoneName')!.value;
    const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)!;
    timestamp = wallTime - (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
  }
  if (minute === 1440) {
    const nextDay = new Date(wallTime).toISOString().slice(0, 10);
    if (historyDayKey(timestamp) !== nextDay || historyDayKey(timestamp - 1) === nextDay) {
      let lower = wallTime - 43_200_000;
      let upper = wallTime + 43_200_000;
      while (lower < upper) {
        const middle = Math.floor((lower + upper) / 2);
        if (historyDayKey(middle) < nextDay) lower = middle + 1;
        else upper = middle;
      }
      timestamp = lower;
    }
  }
  return timestamp;
}

export const historyDayDate = (day: string) => new Date(rangeTimestamp(day, 720));
export const formatHistoryDay = (day: string) => persianDate.format(historyDayDate(day));
export const formatHistoryTime = (minute: number) =>
  `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`
    .replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

export function filterHistoryRange<T extends { recordedAt: string }>(points: T[], day: string, range: TimeRange): T[] {
  const from = rangeTimestamp(day, range[0]);
  const to = rangeTimestamp(day, range[1]);
  return points.filter((point) => {
    const time = new Date(point.recordedAt).getTime();
    return time >= from && time < to;
  });
}
