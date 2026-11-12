const exactTime = new Intl.DateTimeFormat('fa-IR', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const digits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
export function formatTaskTimestamp(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? exactTime.format(time) : 'زمان نامشخص';
}
export function taskElapsed(value: string, now = Date.now()): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'زمان نامشخص';
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (!minutes) return 'کمتر از یک دقیقه';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  return [days && `${digits.format(days)} روز`, hours && `${digits.format(hours)} ساعت`, remainder && `${digits.format(remainder)} دقیقه`]
    .filter(Boolean).join(' و ');
}
