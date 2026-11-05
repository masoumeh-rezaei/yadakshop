import { driverIcon, placeIcon, draftIcon } from "./MapMarkers";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import type { DriverLocation, SavedPlace } from "../types";
import { prepareRouteHistory, type RoutePoint } from "../utils/routeHistory";
import {
  HistoryActionButton,
  type HistoryActionStatus,
  type HistoryRequestResult,
} from "./HistoryActionButton";
import { RouteHistoryLayer } from "./RouteHistoryLayer";
import { prefersReducedMotion } from "../utils/mapMotion";

const defaultCenter: [number, number] = [35.6892, 51.389];
const SELECTED_LOCATION_ZOOM = 18;
const HISTORY_MAX_ZOOM = 16;
const MAP_MAX_ZOOM = 22;
const SELECTED_MARKER_Z_INDEX = 10_000_000;

function DriverPopupHistory({
  driverId,
  onRequest,
  status,
}: {
  driverId: number;
  onRequest: (id: number) => Promise<HistoryRequestResult>;
  status: HistoryActionStatus;
}) {
  const map = useMap();
  const requestHistory = async (status: HistoryActionStatus) => {
    if (status === "loading") return;
    const result = await onRequest(driverId);
    if (result === "success") map.closePopup();
  };

  return (
    <HistoryActionButton
      status={status}
      onClick={() => {
        void requestHistory(status);
      }}
    />
  );
}

function FitInitialLocations({
  locations,
  places,
}: {
  locations: DriverLocation[];
  places: SavedPlace[];
}) {
  const map = useMap();
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current) return;
    const points = [...locations, ...places];
    if (!points.length) return;
    const bounds = L.latLngBounds(
      points.map((item) => [Number(item.latitude), Number(item.longitude)]),
    );
    if (points.length === 1) map.setView(bounds.getCenter(), 15);
    else map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
    hasFitted.current = true;
  }, [locations, places, map]);
  return null;
}

function FocusSelectedDriver({
  location,
  history,
  request,
  loading,
  focusTarget,
}: {
  location: DriverLocation | null;
  history: RoutePoint[];
  request: number;
  loading: boolean;
  focusTarget: "driver" | "history";
}) {
  const map = useMap();
  const handledRequest = useRef(0);
  useEffect(() => {
    if (!request || (loading && focusTarget === "history") || handledRequest.current === request) return;
    const points = focusTarget === "history" && history.length ? history : location ? [location] : [];
    if (!points.length) return;

    handledRequest.current = request;
    const bounds = L.latLngBounds(
      points.map((item) => [Number(item.latitude), Number(item.longitude)]),
    );
    map.stop();
    const animate = !prefersReducedMotion();
    if (
      points.length === 1 ||
      bounds.getNorthEast().equals(bounds.getSouthWest())
    ) {
      map.flyTo(bounds.getCenter(), Math.max(map.getZoom(), SELECTED_LOCATION_ZOOM), {
        animate,
        duration: 0.85,
      });
      return;
    }
    map.flyToBounds(bounds, {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48, 48],
      maxZoom: HISTORY_MAX_ZOOM,
      animate,
      duration: 0.85,
    });
  }, [request, loading, location, history, focusTarget, map]);
  return null;
}

function FocusSelectedPlace({
  place,
  request,
}: {
  place: SavedPlace | null;
  request: number;
}) {
  const map = useMap();
  const handledRequest = useRef(0);
  useEffect(() => {
    if (!place || !request || handledRequest.current === request) return;
    handledRequest.current = request;
    map.stop();
    map.flyTo(
      [Number(place.latitude), Number(place.longitude)],
      Math.max(map.getZoom(), SELECTED_LOCATION_ZOOM),
      { animate: !prefersReducedMotion(), duration: 0.85 },
    );
  }, [place, request, map]);
  return null;
}

function MapClickHandler({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick?: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (enabled) onClick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

interface Props {
  locations: DriverLocation[];
  history?: DriverLocation[];
  historyLoading?: boolean;
  focusRequest?: number;
  focusTarget?: "driver" | "history";
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

export function LiveMap({
  locations,
  history = [],
  historyLoading = false,
  focusRequest = 0,
  focusTarget = "driver",
  selectedId,
  onSelect,
  onHistoryRequest,
  historyStatuses = {},
  places = [],
  selectedPlaceId = null,
  placeFocusRequest = 0,
  onPlaceSelect,
  placementMode = false,
  draftCoordinates = null,
  onMapClick,
}: Props) {
  const validLocations = useMemo(
    () =>
      locations.filter(
        (item) =>
          Number.isFinite(Number(item.latitude)) &&
          Number.isFinite(Number(item.longitude)) &&
          Number(item.latitude) >= -90 && Number(item.latitude) <= 90 &&
          Number(item.longitude) >= -180 && Number(item.longitude) <= 180,
      ),
    [locations],
  );
  const validHistory = useMemo(
    () =>
      history.filter(
        (item) =>
          item.userId === selectedId &&
          Number.isFinite(Number(item.latitude)) &&
          Number.isFinite(Number(item.longitude)) &&
          Number(item.latitude) >= -90 &&
          Number(item.latitude) <= 90 &&
          Number(item.longitude) >= -180 &&
          Number(item.longitude) <= 180,
      ),
    [history, selectedId],
  );
  const route = useMemo(
    () => prepareRouteHistory(validHistory),
    [validHistory],
  );
  const selectedLocation = useMemo(
    () => validLocations.find((item) => item.userId === selectedId) ?? null,
    [validLocations, selectedId],
  );
  const selectedPlace = useMemo(
    () => places.find((item) => item.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );

  return (
    <MapContainer
      center={defaultCenter}
      zoom={12}
      maxZoom={MAP_MAX_ZOOM}
      zoomControl={false}
      className="map font-sans w-full h-full [background:#e7ecef]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={MAP_MAX_ZOOM}
      />
      <ZoomControl position="topleft" zoomInTitle="بزرگ‌نمایی" zoomOutTitle="کوچک‌نمایی" />
      <FitInitialLocations locations={validLocations} places={places} />
      <FocusSelectedDriver
        location={selectedLocation}
        history={route}
        request={focusRequest}
        loading={historyLoading}
        focusTarget={focusTarget}
      />
      <FocusSelectedPlace place={selectedPlace} request={placeFocusRequest} />
      <MapClickHandler enabled={placementMode} onClick={onMapClick} />
      <RouteHistoryLayer points={route} />
      {validLocations.map((location) => (
        <Marker
          key={location.userId}
          position={[Number(location.latitude), Number(location.longitude)]}
          icon={driverIcon(location, selectedId === location.userId)}
          zIndexOffset={selectedId === location.userId ? SELECTED_MARKER_Z_INDEX : 0}
          title={location.fullName || "پیک بدون نام"}
          alt={location.fullName || "پیک بدون نام"}
          eventHandlers={{ click: () => onSelect(location.userId) }}
        >
          <Popup autoPan={false}>
            <strong>{location.fullName || "پیک بدون نام"}</strong>
            <br />
            <span>{location.phone}</span>
            <br />
            <small>
              آخرین ارسال:{" "}
              {new Date(location.recordedAt).toLocaleTimeString("fa-IR")}
            </small>
            {onHistoryRequest && (
              <DriverPopupHistory
                driverId={location.userId}
                onRequest={onHistoryRequest}
                status={historyStatuses[location.userId] ?? "idle"}
              />
            )}
          </Popup>
        </Marker>
      ))}
      {places.map((place) => (
        <Marker
          key={`place-${place.id}`}
          position={[Number(place.latitude), Number(place.longitude)]}
          icon={placeIcon(place, selectedPlaceId === place.id)}
          zIndexOffset={selectedPlaceId === place.id ? SELECTED_MARKER_Z_INDEX : 0}
          eventHandlers={{ click: () => onPlaceSelect?.(place.id) }}
        >
          <Popup>
            <strong>{place.name}</strong>
          </Popup>
        </Marker>
      ))}
      {draftCoordinates && (
        <Marker
          position={[draftCoordinates.latitude, draftCoordinates.longitude]}
          icon={draftIcon}
        />
      )}
    </MapContainer>
  );
}
