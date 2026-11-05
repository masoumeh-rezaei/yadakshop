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
import { AssignmentPicker, type AssignmentControls } from "./AssignmentPicker";

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
      const center = bounds.getCenter();
      const zoom = Math.max(map.getZoom(), SELECTED_LOCATION_ZOOM);
      if (map.distance(map.getCenter(), center) < 1 && Math.abs(map.getZoom() - zoom) < 0.01) return;
      map.flyTo(center, zoom, {
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

function FocusHistoryRange({ points }: { points: DriverLocation[] | null }) {
  const map = useMap();
  useEffect(() => {
    if (points === null) return;
    const route = prepareRouteHistory(points);
    map.stop();
    // Empty intervals keep the current view instead of falling back to the courier pin.
    if (!route.length) return;
    const bounds = L.latLngBounds(route.map((point) => [point.latitude, point.longitude]));
    const zoom = Math.min(18, map.getBoundsZoom(bounds, false, L.point(96, 96)));
    const center = map.unproject(
      map.project(bounds.getSouthWest(), zoom).add(map.project(bounds.getNorthEast(), zoom)).divideBy(2), zoom,
    );
    const centerOffset = map.project(map.getCenter(), zoom).distanceTo(map.project(center, zoom));
    if (Math.abs(map.getZoom() - zoom) < 0.01 && centerOffset < 1) return;
    map.flyTo(center, zoom, { animate: !prefersReducedMotion(), duration: 0.55 });
  }, [points, map]);
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

function DismissPopupOnOutsidePress() {
  const map = useMap();
  useEffect(() => {
    let activePopup: L.Popup | null = null;
    const onOutsidePress = (event: PointerEvent) => {
      const popup = activePopup;
      const element = popup?.getElement();
      if (popup && element && event.target instanceof Node && !element.contains(event.target)) {
        map.closePopup(popup);
      }
    };
    const onOpen = (event: L.PopupEvent) => {
      activePopup = event.popup;
      // Capture also reaches clicks that Leaflet or controls stop from bubbling.
      document.addEventListener('pointerdown', onOutsidePress, true);
    };
    const onClose = (event: L.PopupEvent) => {
      if (event.popup !== activePopup) return;
      activePopup = null;
      document.removeEventListener('pointerdown', onOutsidePress, true);
    };
    map.on('popupopen', onOpen);
    map.on('popupclose', onClose);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePress, true);
      map.off('popupopen', onOpen);
      map.off('popupclose', onClose);
    };
  }, [map]);
  return null;
}

function CourierMarker({ location, selected, onSelect, onHistoryRequest, status, assignments }: {
  location: DriverLocation; selected: boolean; onSelect: (id: number) => void;
  onHistoryRequest?: (id: number) => Promise<HistoryRequestResult>;
  status: HistoryActionStatus; assignments?: AssignmentControls;
}) {
  const map = useMap();
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const isOnline = Date.now() - Date.parse(location.recordedAt) < 120_000;
  const icon = useMemo(() => driverIcon(location, selected), [location.fullName, location.phone, selected, isOnline]);
  const position = useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude]);
  return <Marker position={position} icon={icon} zIndexOffset={selected ? SELECTED_MARKER_Z_INDEX : 0}
    title={location.fullName || 'پیک بدون نام'} alt={location.fullName || 'پیک بدون نام'} autoPanOnFocus={false}
    eventHandlers={{ click: () => { map.stop(); onSelect(location.userId); } }}>
    <Popup autoPan keepInView={false} autoPanPadding={[18, 18]} className="assignment-popup" minWidth={260} maxWidth={320}>
      <div className="assignment-target"><strong>{location.fullName || 'پیک بدون نام'}</strong><small>{location.phone}</small></div>
      {assignments && <AssignmentPicker target={{ kind: 'driver', id: location.userId }} controls={assignments} />}
      {onHistoryRequest && <DriverPopupHistory driverId={location.userId} onRequest={onHistoryRequest} status={status} />}
    </Popup>
  </Marker>;
}

function SavedPlaceMarker({ place, selected, onSelect, assignments }: {
  place: SavedPlace; selected: boolean; onSelect?: (id: number) => void; assignments?: AssignmentControls;
}) {
  const map = useMap();
  const icon = useMemo(() => placeIcon(place, selected), [place.id, place.name, selected]);
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  const position = useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude]);
  return <Marker position={position} icon={icon} autoPanOnFocus={false}
    zIndexOffset={selected ? SELECTED_MARKER_Z_INDEX : 0} eventHandlers={{ click: () => { map.stop(); onSelect?.(place.id); } }}>
    <Popup autoPan keepInView={false} autoPanPadding={[18, 18]} className="assignment-popup" minWidth={260} maxWidth={320}>
      <div className="assignment-target"><strong>{place.name}</strong><small>مکان ذخیره‌شده</small></div>
      {assignments && <AssignmentPicker target={{ kind: 'place', id: place.id }} controls={assignments} />}
    </Popup>
  </Marker>;
}

interface Props {
  locations: DriverLocation[];
  history?: DriverLocation[];
  historyRangeFocus?: DriverLocation[] | null;
  historyLoading?: boolean;
  focusRequest?: number;
  focusTarget?: "driver" | "history";
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMarkerSelect?: (id: number) => void;
  onPlaceMarkerSelect?: (id: number) => void;
  assignments?: AssignmentControls;
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
  historyRangeFocus = null,
  historyLoading = false,
  focusRequest = 0,
  focusTarget = "driver",
  selectedId,
  onSelect,
  onMarkerSelect,
  onPlaceMarkerSelect,
  assignments,
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
      <FocusHistoryRange points={historyRangeFocus} />
      <MapClickHandler enabled={placementMode} onClick={onMapClick} />
      <DismissPopupOnOutsidePress />
      <RouteHistoryLayer points={route} />
      {validLocations.map((location) => <CourierMarker key={location.userId} location={location}
        selected={selectedId === location.userId} onSelect={onMarkerSelect || onSelect}
        onHistoryRequest={onHistoryRequest} status={historyStatuses[location.userId] ?? "idle"} assignments={assignments} />)}
      {places.map((place) => <SavedPlaceMarker key={place.id} place={place}
        selected={selectedPlaceId === place.id} onSelect={onPlaceMarkerSelect || onPlaceSelect} assignments={assignments} />)}
      {draftCoordinates && (
        <Marker
          position={[draftCoordinates.latitude, draftCoordinates.longitude]}
          icon={draftIcon}
        />
      )}
    </MapContainer>
  );
}
