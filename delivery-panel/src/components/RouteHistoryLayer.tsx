import { useMemo } from 'react';
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { buildTimelineSegments, type RoutePoint } from '../utils/routeHistory';

interface Props {
  points: RoutePoint[];
}

export function RouteHistoryLayer({ points }: Props) {
  const segments = useMemo(() => buildTimelineSegments(points), [points]);
  const route = useMemo<[number, number][]>(() => points.map((point) =>
    [point.latitude, point.longitude]), [points]);

  if (points.length === 0) return null;
  const endpoints = points.length === 1 ? [points[0]] : [points[0], points[points.length - 1]];

  return <>
    {segments.length > 0 && <Polyline positions={route} interactive={false} smoothFactor={1.5}
      pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }} />}
    {segments.map((segment, index) => <Polyline key={`${index}-${segment.color}`}
      positions={segment.positions} interactive={false} smoothFactor={1.5}
      pathOptions={{ color: segment.color, weight: 6, opacity: segment.opacity, lineCap: 'round', lineJoin: 'round' }} />)}
    {endpoints.map((point, index) => <CircleMarker key={`${index}-${point.timestamp}`}
      center={[point.latitude, point.longitude]} radius={6}
      pathOptions={{ color: '#fff', weight: 2, fillColor: index === 0 && points.length > 1 ? '#93c5fd' : '#1d4ed8', fillOpacity: 1 }}>
      <Tooltip direction="top">
        {points.length === 1 ? 'موقعیت ثبت‌شده' : index === 0 ? 'ابتدای مسیر' : 'انتهای مسیر'}
        {' · '}{new Date(point.timestamp).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })}
      </Tooltip>
    </CircleMarker>)}
  </>;
}
