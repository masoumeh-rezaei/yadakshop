import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { DriverLocation, SavedPlace } from '../types';

const defaultCenter: [number, number] = [35.6892, 51.389];

const markerIcon = (online: boolean, selected: boolean) => L.divIcon({
  className: 'driver-marker-wrapper',
  html: `<div class="driver-marker ${online ? 'online' : 'offline'} ${selected ? 'selected' : ''}"><span></span></div>`,
  iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -17],
});

const placeIcon = (selected: boolean) => L.divIcon({
  className: 'place-marker-wrapper',
  html: `<div class="place-marker ${selected ? 'selected' : ''}"><span></span></div>`,
  iconSize: [34, 40], iconAnchor: [17, 40], popupAnchor: [0, -38],
});

const draftIcon = L.divIcon({
  className: 'place-marker-wrapper',
  html: '<div class="place-marker draft"><span></span></div>',
  iconSize: [34, 40], iconAnchor: [17, 40], popupAnchor: [0, -38],
});

const isOnline = (date: string) => Date.now() - new Date(date).getTime() < 2 * 60 * 1000;

function FitLocations({ locations, places }: { locations: DriverLocation[]; places: SavedPlace[] }) {
  const map = useMap();
  const points = [...locations, ...places];
  const key = points.map((item) => `${item.id}:${item.latitude}:${item.longitude}`).join('|');
  useEffect(() => {
    if (!points.length) return;
    // محدوده نقشه با جابه‌جایی پیک‌ها تنظیم می‌شود؛ برای یک پیک zoom ثابت خواناتر است.
    const bounds = L.latLngBounds(points.map((item) => [Number(item.latitude), Number(item.longitude)]));
    if (points.length === 1) map.setView(bounds.getCenter(), 15);
    else map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
  }, [key, map]);
  return null;
}

function MapClickHandler({ enabled, onClick }: { enabled: boolean; onClick?: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: (event) => { if (enabled) onClick?.(event.latlng.lat, event.latlng.lng); } });
  return null;
}

interface Props {
  locations: DriverLocation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  places?: SavedPlace[];
  selectedPlaceId?: number | null;
  onPlaceSelect?: (id: number) => void;
  placementMode?: boolean;
  draftCoordinates?: { latitude: number; longitude: number } | null;
  onMapClick?: (latitude: number, longitude: number) => void;
}

export function LiveMap({ locations, selectedId, onSelect, places = [], selectedPlaceId = null,
  onPlaceSelect, placementMode = false, draftCoordinates = null, onMapClick }: Props) {
  const validLocations = useMemo(() => locations.filter((item) =>
    Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))), [locations]);

  return (
    <MapContainer center={defaultCenter} zoom={12} zoomControl={false} className="map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitLocations locations={validLocations} places={places} />
      <MapClickHandler enabled={placementMode} onClick={onMapClick} />
      {validLocations.map((location) => (
        <Marker key={location.userId} position={[Number(location.latitude), Number(location.longitude)]}
          icon={markerIcon(isOnline(location.recordedAt), selectedId === location.userId)}
          eventHandlers={{ click: () => onSelect(location.userId) }}>
          <Popup>
            <strong>{location.fullName || 'پیک بدون نام'}</strong><br />
            <span>{location.phone}</span><br />
            <small>آخرین ارسال: {new Date(location.recordedAt).toLocaleTimeString('fa-IR')}</small>
          </Popup>
        </Marker>
      ))}
      {places.map((place) => (
        <Marker key={`place-${place.id}`} position={[Number(place.latitude), Number(place.longitude)]}
          icon={placeIcon(selectedPlaceId === place.id)}
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
