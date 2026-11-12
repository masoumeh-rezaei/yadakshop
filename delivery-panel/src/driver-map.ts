import L from 'leaflet';
import './styles.css';

interface Destination { id: number; placeName: string; latitude: number; longitude: number }
interface MapPayload {
  type: 'delivery:tasks-map';
  tasks: Destination[];
  selectedTaskId: number | null;
  focusRequest?: number;
  locationFocusRequest?: number;
  currentLocation?: { latitude: number; longitude: number } | null;
}
declare global {
  interface Window {
    updateDriverTaskMap: (payload: unknown) => void;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

const map = L.map('driver-task-map', { maxZoom: 22, zoomControl: false }).setView([35.6892, 51.389], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxNativeZoom: 19, maxZoom: 22,
}).addTo(map);
L.control.zoom({ position: 'topleft', zoomInTitle: 'بزرگ‌نمایی', zoomOutTitle: 'کوچک‌نمایی' }).addTo(map);

const markers = new Map<number, L.Marker>();
const markerContent = new Map<number, string>();
let currentPosition: L.Marker | null = null;
let previousTaskIds = '';
let previousSelection: number | null = null;
let previousFocusRequest = 0;
let previousLocationFocus = 0;
let fitted = false;
const validCoordinates = (value: unknown): value is { latitude: number; longitude: number } => {
  const point = value as { latitude?: unknown; longitude?: unknown } | null;
  return Boolean(point && typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
};
function notify(message: object) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}
const icon = (selected: boolean) => L.divIcon({
  className: 'mobile-destination-marker', iconSize: [36, 40], iconAnchor: [18, 38],
  html: `<div class="mobile-building-pin ${selected ? 'selected' : ''}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4M9 21v-3h2v3"/></svg></div>`,
});
function destinationPopup(task: Destination): HTMLElement {
  const content = document.createElement('div');
  content.className = 'mobile-destination-popup';
  content.dir = 'rtl';
  const name = document.createElement('strong');
  name.textContent = task.placeName;
  content.append(name);
  for (const [action, label] of [['neshan', 'باز کردن در نشان'], ['share', 'اشتراک‌گذاری مقصد'], ['save', 'ذخیره در گوشی']] as const) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', event => {
      L.DomEvent.stop(event);
      notify({ type: 'delivery:task-action', id: task.id, action });
      map.closePopup();
    });
    content.append(button);
  }
  return content;
}

window.updateDriverTaskMap = (input: unknown) => {
  const payload = input as MapPayload | null;
  if (!payload || payload.type !== 'delivery:tasks-map' || !Array.isArray(payload.tasks)) return;
  const tasks = payload.tasks.filter((task) => validCoordinates(task) && Number.isSafeInteger(task.id) && task.id > 0 && typeof task.placeName === 'string');
  const ids = new Set(tasks.map((task) => task.id));
  for (const [id, marker] of markers) if (!ids.has(id)) { marker.remove(); markers.delete(id); markerContent.delete(id); }
  for (const task of tasks) {
    const selected = task.id === payload.selectedTaskId;
    let marker = markers.get(task.id);
    if (!marker) {
      marker = L.marker([task.latitude, task.longitude], { icon: icon(selected), autoPanOnFocus: false }).addTo(map);
      marker.on('click', () => notify({ type: 'delivery:task-selected', id: task.id }));
      markers.set(task.id, marker);
    } else {
      const point = marker.getLatLng();
      if (point.lat !== task.latitude || point.lng !== task.longitude) marker.setLatLng([task.latitude, task.longitude]);
      if ((previousSelection === task.id) !== selected) marker.setIcon(icon(selected));
    }
    marker.setZIndexOffset(selected ? 10_000_000 : 0);
    const contentKey = `${task.placeName}:${selected}`;
    if (markerContent.get(task.id) !== contentKey) {
      const label = document.createElement('span');
      label.textContent = task.placeName;
      marker.unbindTooltip().bindTooltip(label, { direction: 'top', offset: [0, -35], permanent: selected });
      const popup = destinationPopup(task);
      if (marker.getPopup()) marker.setPopupContent(popup);
      else marker.bindPopup(popup, { minWidth: 190, maxWidth: 260 });
      markerContent.set(task.id, contentKey);
    }
  }
  if (validCoordinates(payload.currentLocation)) {
    const point: [number, number] = [payload.currentLocation.latitude, payload.currentLocation.longitude];
    if (!currentPosition) currentPosition = L.marker(point, { zIndexOffset: 1000,
      icon: L.divIcon({ className: 'mobile-current-marker', iconSize: [30, 38], iconAnchor: [15, 36],
        html: '<div class="mobile-current-pin"><span></span></div>' })
    }).addTo(map).bindTooltip('موقعیت من', { permanent: true, direction: 'top', offset: [0, -34] });
    else currentPosition.setLatLng(point);
  } else if (currentPosition) { currentPosition.remove(); currentPosition = null; }

  const selection = tasks.find((task) => task.id === payload.selectedTaskId);
  const signature = tasks.map((task) => task.id).sort((a, b) => a - b).join(',');
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (currentPosition && (payload.locationFocusRequest || 0) !== previousLocationFocus) {
    map.stop().flyTo(currentPosition.getLatLng(), 18, { animate, duration: .6 });
    fitted = true;
  } else if (selection && (previousSelection !== selection.id || previousFocusRequest !== (payload.focusRequest || 0))) {
    map.stop().flyTo([selection.latitude, selection.longitude], 19, { animate: animate && fitted, duration: .6 });
    fitted = true;
  } else if ((!selection && signature !== previousTaskIds) || !fitted) {
    const points: L.LatLngExpression[] = tasks.map((task) => [task.latitude, task.longitude]);
    if (currentPosition) points.push(currentPosition.getLatLng());
    if (points.length) { map.fitBounds(L.latLngBounds(points), { padding: [35, 45], maxZoom: 16, animate: false }); fitted = true; }
  }
  previousTaskIds = signature;
  previousSelection = selection?.id ?? null;
  previousFocusRequest = payload.focusRequest || 0;
  previousLocationFocus = payload.locationFocusRequest || 0;
};

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window.parent) return;
  window.updateDriverTaskMap(event.data);
});
if (typeof ResizeObserver === 'function') new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(document.getElementById('driver-task-map')!);
else window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
notify({ type: 'delivery:task-map-ready' });
