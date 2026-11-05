const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function tehranDayKey(date: Date): string {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', timeZoneName: 'longOffset' });

export function tehranDayStart(day: string): Date {
  const wallTime = Date.parse(`${day}T00:00:00Z`);
  let timestamp = wallTime;
  // Resolve the timezone from Intl, including the historical daylight-saving offset.
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = offsetFormatter.formatToParts(timestamp).find((part) => part.type === 'timeZoneName')!.value;
    const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)!;
    timestamp = wallTime - (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
  }
  // Older records can fall on a DST transition where local midnight did not exist.
  if (tehranDayKey(new Date(timestamp)) !== day || tehranDayKey(new Date(timestamp - 1)) === day) {
    let lower = wallTime - 43_200_000;
    let upper = wallTime + 43_200_000;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (tehranDayKey(new Date(middle)) < day) lower = middle + 1;
      else upper = middle;
    }
    timestamp = lower;
  }
  return new Date(timestamp);
}

export function historyWindow(from: unknown, to: unknown, now = new Date()) {
  if (from === undefined && to === undefined) {
    return { from: new Date(now.getTime() - 86_400_000), to: now };
  }
  // Require an explicit timezone so the server's local timezone cannot change a request.
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof from !== 'string' || typeof to !== 'string' || !iso.test(from) || !iso.test(to)) return null;
  const validDay = (value: string) => {
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
  };
  if (!validDay(from) || !validDay(to)) return null;
  const start = new Date(from);
  const end = new Date(to);
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400_000) return null;
  return { from: start, to: end };
}
