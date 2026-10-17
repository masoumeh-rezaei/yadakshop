import type { DriverLocation } from '../types';

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
}

export interface RouteSegment {
  positions: [[number, number], [number, number]];
  color: string;
  opacity: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const MIN_POINT_DISTANCE_METERS = 4;
const MAX_ACCEPTABLE_ACCURACY_METERS = 100;
const MIN_STAY_DURATION_MS = 2 * 60 * 1000;
const MIN_STAY_POINTS = 5;
const MIN_STAY_RADIUS_METERS = 80;
const MAX_STAY_RADIUS_METERS = 160;
const REQUIRED_STAY_INLIER_RATIO = 0.8;
const MAX_RENDERED_POINTS = 250;
const TIMELINE_COLORS = [
  [124, 58, 237],
  [37, 99, 235],
  [8, 145, 178],
  [22, 163, 74],
  [245, 158, 11],
  [234, 88, 12],
] as const;

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
  const accuracyRadius = Math.max(80, Math.min(200, (point.accuracy ?? 40) * 2));
  const isIsolatedDetour = incoming > accuracyRadius && outgoing > accuracyRadius &&
    direct < Math.max(50, Math.min(incoming, outgoing) * 0.35);
  return !isIsolatedDetour;
});

const pointWeight = (point: RoutePoint) => 1 / Math.max(5, point.accuracy ?? 25) ** 2;

interface ClusterAccumulator {
  latitude: number;
  longitude: number;
  totalWeight: number;
  firstTimestamp: number;
  lastTimestamp: number;
  accuracyTotal: number;
  accuracyCount: number;
}

const addToCluster = (cluster: ClusterAccumulator, point: RoutePoint) => {
  const weight = pointWeight(point);
  cluster.latitude += point.latitude * weight;
  cluster.longitude += point.longitude * weight;
  cluster.totalWeight += weight;
  cluster.firstTimestamp = Math.min(cluster.firstTimestamp, point.timestamp);
  cluster.lastTimestamp = Math.max(cluster.lastTimestamp, point.timestamp);
  if (point.accuracy !== null) {
    cluster.accuracyTotal += point.accuracy;
    cluster.accuracyCount += 1;
  }
};

const createCluster = (points: RoutePoint[]) => {
  const cluster: ClusterAccumulator = {
    latitude: 0, longitude: 0, totalWeight: 0,
    firstTimestamp: Number.POSITIVE_INFINITY, lastTimestamp: Number.NEGATIVE_INFINITY,
    accuracyTotal: 0, accuracyCount: 0,
  };
  points.forEach((point) => addToCluster(cluster, point));
  return cluster;
};

const clusterCenter = (cluster: ClusterAccumulator): RoutePoint => ({
  latitude: cluster.latitude / cluster.totalWeight,
  longitude: cluster.longitude / cluster.totalWeight,
  timestamp: Math.round((cluster.firstTimestamp + cluster.lastTimestamp) / 2),
  accuracy: cluster.accuracyCount ? cluster.accuracyTotal / cluster.accuracyCount : null,
});

const stayRadius = (center: RoutePoint) => Math.max(MIN_STAY_RADIUS_METERS,
  Math.min(MAX_STAY_RADIUS_METERS, (center.accuracy ?? 40) * 2));

const findSeedEnd = (points: RoutePoint[], startIndex: number) => {
  const minimumEndTime = points[startIndex].timestamp + MIN_STAY_DURATION_MS;
  for (let index = startIndex + MIN_STAY_POINTS - 1; index < points.length; index += 1) {
    if (points[index].timestamp >= minimumEndTime) return index;
  }
  return -1;
};

const collapseStationaryPeriods = (points: RoutePoint[]) => {
  const result: RoutePoint[] = [];
  let startIndex = 0;

  while (startIndex < points.length) {
    const seedEnd = findSeedEnd(points, startIndex);
    if (seedEnd === -1) {
      result.push(...points.slice(startIndex));
      break;
    }

    const seed = points.slice(startIndex, seedEnd + 1);
    let center = clusterCenter(createCluster(seed));
    let radius = stayRadius(center);
    let inliers = seed.filter((point) => distanceBetween(point, center) <= radius);
    if (inliers.length / seed.length < REQUIRED_STAY_INLIER_RATIO) {
      result.push(points[startIndex]);
      startIndex += 1;
      continue;
    }

    const cluster = createCluster(inliers);
    center = clusterCenter(cluster);
    radius = stayRadius(center);
    let cursor = seedEnd + 1;
    let pendingOutliers: RoutePoint[] = [];
    let pendingStartIndex = -1;
    while (cursor < points.length) {
      const candidate = points[cursor];
      if (distanceBetween(candidate, center) <= radius) {
        addToCluster(cluster, candidate);
        center = clusterCenter(cluster);
        radius = stayRadius(center);
        pendingOutliers = [];
        pendingStartIndex = -1;
      } else {
        if (pendingStartIndex === -1) pendingStartIndex = cursor;
        pendingOutliers.push(candidate);
        if (pendingOutliers.length >= 2) break;
      }
      cursor += 1;
    }

    result.push(clusterCenter(cluster));
    startIndex = pendingStartIndex === -1 ? cursor : pendingStartIndex;
  }

  return result;
};

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
    accuracy: item.accuracy == null ? null : Number(item.accuracy),
  })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Number.isFinite(point.timestamp) && point.latitude >= -90 && point.latitude <= 90 &&
    point.longitude >= -180 && point.longitude <= 180 &&
    (point.accuracy === null || (Number.isFinite(point.accuracy) && point.accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS)))
    .sort((first, second) => first.timestamp - second.timestamp);

  const cleaned = collapseStationaryPeriods(removeGpsSpikes(removeNearbyPoints(normalized)));
  let tolerance = initialTolerance(cleaned.length);
  let simplified = simplify(cleaned, tolerance);
  while (simplified.length > MAX_RENDERED_POINTS) {
    tolerance *= 1.5;
    simplified = simplify(cleaned, tolerance);
  }
  return simplified;
}

const interpolateColor = (progress: number) => {
  const scaledProgress = Math.max(0, Math.min(1, progress)) * (TIMELINE_COLORS.length - 1);
  const startIndex = Math.min(Math.floor(scaledProgress), TIMELINE_COLORS.length - 2);
  const localProgress = scaledProgress - startIndex;
  const startColor = TIMELINE_COLORS[startIndex];
  const endColor = TIMELINE_COLORS[startIndex + 1];
  const channels = startColor.map((start, index) =>
    Math.round(start + (endColor[index] - start) * localProgress));
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
      opacity: 0.9,
    };
  });
}
