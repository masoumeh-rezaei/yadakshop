export function taskMapUrl(apiUrl: string, development: boolean, configured?: string): string {
  if (configured) return configured;
  const url = new URL(apiUrl);
  // Local API and Vite use separate ports; production serves the map beside the API.
  if (development && url.protocol === 'http:' && url.port === '3000') url.port = '5173';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/driver-map.html`;
  url.search = ''; url.hash = '';
  return url.toString();
}
