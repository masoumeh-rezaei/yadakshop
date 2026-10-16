import type { DriverLocation } from '../types';

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface RouteSegment {
  positions: [[number, number], [number, number]];
  color: string;
  opacity: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const MIN_POINT_DISTANCE_METERS = 4;
const MAX_RENDERED_POINTS = 250;
const GRADIENT_START = [191, 219, 254] as const;
const GRADIENT_END = [29, 78, 216] as const;

const distanceBetween = (first: RoutePoint, second: RoutePoint) => {
  const toRadians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * toRadians;
  const longitudeDelta = (second.longitude - first.longitude) * toRadians;
  const firstLatitude = first.latitude * toRadians;
  const secondLatitude = second.latitude * toRadians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

const distanceToSegment = (point: RoutePoint, start: RoutePoint, end: RoutePoint) => {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(((start.latitude + end.latitude) / 2) * Math.PI / 180);
  const endX = (end.longitude - start.longitude) * longitudeScale;
  const endY = (end.latitude - start.latitude) * latitudeScale;
  const pointX = (point.longitude - start.longitude) * longitudeScale;
  const pointY = (point.latitude - start.latitude) * latitudeScale;
  const segmentLengthSquared = endX ** 2 + endY ** 2;
  if (!segmentLengthSquared) return Math.hypot(pointX, pointY);
  const ratio = Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / segmentLengthSquared));
  return Math.hypot(pointX - ratio * endX, pointY - ratio * endY);
};

const removeNearbyPoints = (points: RoutePoint[]) => {
  if (points.length <= 2) return points;
  const filtered = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    if (distanceBetween(filtered[filtered.length - 1], points[index]) >= MIN_POINT_DISTANCE_METERS) {
      filtered.push(points[index]);
    }
  }
  filtered.push(points[points.length - 1]);
  return filtered;
};

const removeGpsSpikes = (points: RoutePoint[]) => points.filter((point, index) => {
  if (index === 0 || index === points.length - 1) return true;
  const previous = points[index - 1];
  const next = points[index + 1];
  const incoming = distanceBetween(previous, point);
  const outgoing = distanceBetween(point, next);
  const direct = distanceBetween(previous, next);
  const isIsolatedDetour = incoming > 250 && outgoing > 250 && direct < Math.max(60, Math.min(incoming, outgoing) * 0.25);
  return !isIsolatedDetour;
});

const simplify = (points: RoutePoint[], toleranceMeters: number) => {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const ranges: Array<[number, number]> = [[0, points.length - 1]];

  while (ranges.length) {
    const [startIndex, endIndex] = ranges.pop()!;
    let farthestIndex = -1;
    let farthestDistance = toleranceMeters;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToSegment(points[index], points[startIndex], points[endIndex]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex !== -1) {
      keep[farthestIndex] = true;
      ranges.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
};

const initialTolerance = (pointCount: number) => pointCount > 500 ? 30 : pointCount > 150 ? 20 : 12;

export function prepareRouteHistory(history: DriverLocation[]): RoutePoint[] {
  const normalized = history.map((item) => ({
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    timestamp: new Date(item.recordedAt).getTime(),
  })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Number.isFinite(point.timestamp) && point.latitude >= -90 && point.latitude <= 90 &&
    point.longitude >= -180 && point.longitude <= 180)
    .sort((first, second) => first.timestamp - second.timestamp);

  const cleaned = removeGpsSpikes(removeNearbyPoints(normalized));
  let tolerance = initialTolerance(cleaned.length);
  let simplified = simplify(cleaned, tolerance);
  while (simplified.length > MAX_RENDERED_POINTS) {
    tolerance *= 1.5;
    simplified = simplify(cleaned, tolerance);
  }
  return simplified;
}

const interpolateColor = (progress: number) => {
  const channels = GRADIENT_START.map((start, index) =>
    Math.round(start + (GRADIENT_END[index] - start) * progress));
  return `rgb(${channels.join(', ')})`;
};

export function buildTimelineSegments(points: RoutePoint[]): RouteSegment[] {
  if (points.length < 2) return [];
  const firstTimestamp = points[0].timestamp;
  const duration = Math.max(1, points[points.length - 1].timestamp - firstTimestamp);
  return points.slice(1).map((point, index) => {
    const progress = Math.max(0, Math.min(1, (point.timestamp - firstTimestamp) / duration));
    const previous = points[index];
    return {
      positions: [[previous.latitude, previous.longitude], [point.latitude, point.longitude]],
      color: interpolateColor(progress),
      opacity: 0.38 + progress * 0.57,
    };
  });
}
