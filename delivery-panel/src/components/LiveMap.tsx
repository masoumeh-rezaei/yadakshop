import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { DriverLocation } from '../types';

const defaultCenter: [number, number] = [35.6892, 51.389];

const markerIcon = (online: boolean, selected: boolean) => L.divIcon({
  className: 'driver-marker-wrapper',
  html: `<div class="driver-marker ${online ? 'online' : 'offline'} ${selected ? 'selected' : ''}"><span></span></div>`,
  iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -17],
});

const isOnline = (date: string) => Date.now() - new Date(date).getTime() < 2 * 60 * 1000;

function FitLocations({ locations }: { locations: DriverLocation[] }) {
  const map = useMap();
  const key = locations.map((item) => `${item.userId}:${item.latitude}:${item.longitude}`).join('|');
  useEffect(() => {
    if (!locations.length) return;
    const bounds = L.latLngBounds(locations.map((item) => [Number(item.latitude), Number(item.longitude)]));
    if (locations.length === 1) map.setView(bounds.getCenter(), 15);
    else map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
  }, [key, locations, map]);
  return null;
}

interface Props {
  locations: DriverLocation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function LiveMap({ locations, selectedId, onSelect }: Props) {
  const validLocations = useMemo(() => locations.filter((item) =>
    Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))), [locations]);

  return (
    <MapContainer center={defaultCenter} zoom={12} zoomControl={false} className="map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitLocations locations={validLocations} />
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
    </MapContainer>
  );
}
