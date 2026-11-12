/** Use the same Tehran timestamp and relative time in both driver lists. */
export function locationTime(date: string): string {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return 'زمان نامشخص';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} ثانیه پیش`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقیقه پیش`;
  return new Date(timestamp).toLocaleString('fa-IR', {
    timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric',
  });
}
