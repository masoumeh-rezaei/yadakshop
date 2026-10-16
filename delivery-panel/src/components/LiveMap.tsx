import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { DriverLocation, SavedPlace } from '../types';
import { HistoryActionButton, type HistoryActionStatus, type HistoryRequestResult } from './HistoryActionButton';

const defaultCenter: [number, number] = [35.6892, 51.389];
const SELECTED_LOCATION_ZOOM = 18;
const HISTORY_MAX_ZOOM = 16;

const driverIcon = (location: DriverLocation, selected: boolean) => {
  const displayName = escapeHtml(location.fullName?.trim() || location.phone || 'پیک بدون نام');
  return L.divIcon({
    className: 'driver-marker-wrapper',
    html: `<div class="driver-marker-card ${isOnline(location.recordedAt) ? 'online' : 'offline'} ${selected ? 'selected' : ''}">
      <div class="driver-marker-label" title="${displayName}"><span>${displayName}</span></div>
      <div class="driver-marker-pin"><span></span></div>
      <div class="driver-marker-shadow"></div>
    </div>`,
    iconSize: [150, 62], iconAnchor: [75, 58], popupAnchor: [0, -56],
  });
};

const placeColors = ['#7c3aed', '#db2777', '#2563eb', '#0891b2', '#059669', '#ca8a04', '#ea580c', '#dc2626', '#4f46e5'];

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character] ?? character));

const placeIcon = (place: SavedPlace, selected: boolean) => {
  const color = placeColors[Math.abs(Number(place.id)) % placeColors.length];
  const name = escapeHtml(place.name);
  const initial = escapeHtml(Array.from(place.name.trim())[0] || 'م');
  return L.divIcon({
    className: 'place-marker-wrapper',
    html: `<div class="place-marker-card ${selected ? 'selected' : ''}" style="--place-color:${color}">
      <div class="place-marker-label"><span>${name}</span></div>
      <div class="place-marker-pin"><span>${initial}</span></div>
      <div class="place-marker-shadow"></div>
    </div>`,
    iconSize: [140, 62], iconAnchor: [70, 58], popupAnchor: [0, -56],
  });
};

const draftIcon = L.divIcon({
  className: 'place-marker-wrapper',
  html: '<div class="place-marker-card draft"><div class="place-marker-label"><span>مکان جدید</span></div><div class="place-marker-pin"><span>+</span></div><div class="place-marker-shadow"></div></div>',
  iconSize: [140, 62], iconAnchor: [70, 58], popupAnchor: [0, -56],
});

const isOnline = (date: string) => Date.now() - new Date(date).getTime() < 2 * 60 * 1000;

function DriverPopupHistory({ driverId, onRequest, status }: {
  driverId: number;
  onRequest: (id: number) => Promise<HistoryRequestResult>;
  status: HistoryActionStatus;
}) {
  const map = useMap();
  const requestHistory = async (status: HistoryActionStatus) => {
    if (status === 'loading' || status === 'empty') return;
    const result = await onRequest(driverId);
    if (result === 'success') map.closePopup();
  };

  return <HistoryActionButton status={status} onClick={() => { void requestHistory(status); }} />;
}

function FitInitialLocations({ locations, places }: { locations: DriverLocation[]; places: SavedPlace[] }) {
  const map = useMap();
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current) return;
    const points = [...locations, ...places];
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((item) => [Number(item.latitude), Number(item.longitude)]));
    if (points.length === 1) map.setView(bounds.getCenter(), 15);
    else map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
    hasFitted.current = true;
  }, [locations, places, map]);
  return null;
}

function FocusSelectedDriver({ location, history, request, loading }: {
  location: DriverLocation | null;
  history: DriverLocation[];
  request: number;
  loading: boolean;
}) {
  const map = useMap();
  const handledRequest = useRef(0);
  useEffect(() => {
    if (!request || loading || handledRequest.current === request) return;
    const points = history.length ? history : location ? [location] : [];
    if (!points.length) return;

    handledRequest.current = request;
    const bounds = L.latLngBounds(points.map((item) => [Number(item.latitude), Number(item.longitude)]));
    map.stop();
    if (points.length === 1 || bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(bounds.getCenter(), SELECTED_LOCATION_ZOOM, { animate: false });
      return;
    }
    map.fitBounds(bounds, {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48, 48],
      maxZoom: HISTORY_MAX_ZOOM,
      animate: false,
    });
  }, [request, loading, location, history, map]);
  return null;
}

function FocusSelectedPlace({ place, request }: { place: SavedPlace | null; request: number }) {
  const map = useMap();
  const handledRequest = useRef(0);
  useEffect(() => {
    if (!place || !request || handledRequest.current === request) return;
    handledRequest.current = request;
    map.stop();
    map.setView([Number(place.latitude), Number(place.longitude)], SELECTED_LOCATION_ZOOM, { animate: false });
  }, [place, request, map]);
  return null;
}

function MapClickHandler({ enabled, onClick }: { enabled: boolean; onClick?: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: (event) => { if (enabled) onClick?.(event.latlng.lat, event.latlng.lng); } });
  return null;
}

interface Props {
  locations: DriverLocation[];
  history?: DriverLocation[];
  historyLoading?: boolean;
  focusRequest?: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onHistoryRequest?: (id: number) => Promise<HistoryRequestResult>;
  historyStatuses?: Record<number, HistoryActionStatus>;
  places?: SavedPlace[];
  selectedPlaceId?: number | null;
  placeFocusRequest?: number;
  onPlaceSelect?: (id: number) => void;
  placementMode?: boolean;
  draftCoordinates?: { latitude: number; longitude: number } | null;
  onMapClick?: (latitude: number, longitude: number) => void;
}

export function LiveMap({ locations, history = [], historyLoading = false, focusRequest = 0,
  selectedId, onSelect, onHistoryRequest, historyStatuses = {}, places = [], selectedPlaceId = null,
  placeFocusRequest = 0, onPlaceSelect, placementMode = false, draftCoordinates = null, onMapClick }: Props) {
  const validLocations = useMemo(() => locations.filter((item) =>
    Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))), [locations]);
  const validHistory = useMemo(() => history.filter((item) => item.userId === selectedId &&
    Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) &&
    Number(item.latitude) >= -90 && Number(item.latitude) <= 90 &&
    Number(item.longitude) >= -180 && Number(item.longitude) <= 180), [history, selectedId]);
  const route = useMemo<[number, number][]>(() => validHistory.map((item) =>
    [Number(item.latitude), Number(item.longitude)]), [validHistory]);
  const selectedLocation = useMemo(() => validLocations.find((item) => item.userId === selectedId) ?? null,
    [validLocations, selectedId]);
  const selectedPlace = useMemo(() => places.find((item) => item.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId]);

  return (
    <MapContainer center={defaultCenter} zoom={12} zoomControl={false} className="map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitInitialLocations locations={validLocations} places={places} />
      <FocusSelectedDriver location={selectedLocation} history={validHistory}
        request={focusRequest} loading={historyLoading} />
      <FocusSelectedPlace place={selectedPlace} request={placeFocusRequest} />
      <MapClickHandler enabled={placementMode} onClick={onMapClick} />
      {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.82 }} />}
      {validLocations.map((location) => (
        <Marker key={location.userId} position={[Number(location.latitude), Number(location.longitude)]}
          icon={driverIcon(location, selectedId === location.userId)}
          eventHandlers={{ click: () => onSelect(location.userId) }}>
          <Popup autoPan={false}>
            <strong>{location.fullName || 'پیک بدون نام'}</strong><br />
            <span>{location.phone}</span><br />
            <small>آخرین ارسال: {new Date(location.recordedAt).toLocaleTimeString('fa-IR')}</small>
            {onHistoryRequest && <DriverPopupHistory driverId={location.userId} onRequest={onHistoryRequest}
              status={historyStatuses[location.userId] ?? 'idle'} />}
          </Popup>
        </Marker>
      ))}
      {places.map((place) => (
        <Marker key={`place-${place.id}`} position={[Number(place.latitude), Number(place.longitude)]}
          icon={placeIcon(place, selectedPlaceId === place.id)}
          eventHandlers={{ click: () => onPlaceSelect?.(place.id) }}>
          <Popup><strong>{place.name}</strong><br /><small dir="ltr">
            {Number(place.latitude).toFixed(6)}, {Number(place.longitude).toFixed(6)}
          </small></Popup>
        </Marker>
      ))}
      {draftCoordinates && <Marker position={[draftCoordinates.latitude, draftCoordinates.longitude]} icon={draftIcon} />}
    </MapContainer>
  );
}
