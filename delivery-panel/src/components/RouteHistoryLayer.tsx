import { useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import { buildTimelineSegments, type RoutePoint } from '../utils/routeHistory';

interface Props {
  points: RoutePoint[];
}

export function RouteHistoryLayer({ points }: Props) {
  const segments = useMemo(() => buildTimelineSegments(points), [points]);
  const route = useMemo<[number, number][]>(() => points.map((point) =>
    [point.latitude, point.longitude]), [points]);

  if (segments.length === 0) return null;

  return <>
    <Polyline positions={route} interactive={false} smoothFactor={1.5}
      pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.7, lineCap: 'round', lineJoin: 'round' }} />
    {segments.map((segment, index) => <Polyline key={`${index}-${segment.color}`}
      positions={segment.positions} interactive={false} smoothFactor={1.5}
      pathOptions={{ color: segment.color, weight: 5, opacity: segment.opacity, lineCap: 'round', lineJoin: 'round' }} />)}
  </>;
}
