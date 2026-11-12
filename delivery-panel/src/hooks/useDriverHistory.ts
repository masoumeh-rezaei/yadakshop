import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { DriverLocation, HistoryDay } from '../types';
import type { HistoryActionStatus, HistoryRequestResult } from '../components/HistoryActionButton';
import { filterHistoryRange, FULL_DAY, historyDayKey, rangeTimestamp, type TimeRange } from '../utils/historyTime';

interface HistoryState {
  driverId: number | null;
  days: HistoryDay[];
  recent: DriverLocation[];
  dayPoints: DriverLocation[];
  selectedDay: string | null;
  range: TimeRange;
  rangeActive: boolean;
  loading: boolean;
  dayLoading: boolean;
  error: string;
  dayError: string;
}
const initialState = (): HistoryState => ({
  driverId: null, days: [], recent: [], dayPoints: [], selectedDay: null,
  range: [...FULL_DAY], rangeActive: false, loading: false, dayLoading: false,
  error: '', dayError: '',
});
const mergePoints = (first: DriverLocation[], second: DriverLocation[]) =>
  [...new Map([...first, ...second].map((point) => [point.id, point])).values()]
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
const recentPoints = (points: DriverLocation[]) => {
  const now = Date.now();
  return points.filter((point) => {
    const time = Date.parse(point.recordedAt);
    return time >= now - 86_400_000 && time <= now;
  });
};
const errorMessage = (error: unknown) => error instanceof ApiError
  ? error.message : 'دریافت تاریخچه ناموفق بود؛ دوباره تلاش کنید.';

export function useDriverHistory(token: string | null, onUnauthorized: () => void) {
  const [state, setState] = useState<HistoryState>(initialState);
  const [statuses, setStatuses] = useState<Record<number, HistoryActionStatus>>({});
  const overviewRequest = useRef<AbortController | null>(null);
  const dayRequest = useRef<AbortController | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  const cancel = useCallback(() => {
    overviewRequest.current?.abort();
    dayRequest.current?.abort();
    overviewRequest.current = null;
    dayRequest.current = null;
    setStatuses((current) => Object.fromEntries(Object.entries(current)
      .map(([id, status]) => [id, status === 'loading' ? 'idle' : status])));
  }, []);

  const close = useCallback(() => {
    cancel();
    setState(initialState());
  }, [cancel]);

  useEffect(() => () => {
    overviewRequest.current?.abort();
    dayRequest.current?.abort();
    overviewRequest.current = null;
    dayRequest.current = null;
  }, []);

  useEffect(() => {
    if (state.driverId === null) return;
    const timer = window.setInterval(() => setState((current) => ({
      ...current, recent: recentPoints(current.recent),
    })), 30_000);
    return () => window.clearInterval(timer);
  }, [state.driverId]);

  const open = useCallback(async (driverId: number): Promise<HistoryRequestResult> => {
    if (!token) return 'error';
    cancel();
    const controller = new AbortController();
    overviewRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setState({ ...initialState(), driverId, loading: true });
    setStatuses((current) => ({ ...current, [driverId]: 'loading' }));
    try {
      const [days, recent] = await Promise.all([
        api.locationHistoryDays(token, driverId, controller.signal),
        api.locationHistory(token, driverId, controller.signal),
      ]);
      if (overviewRequest.current !== controller) return 'cancelled';
      setState((current) => ({
        ...current, days: [...new Map([...days, ...current.days].map((day) => [day.date, day])).values()]
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
        recent: recentPoints(mergePoints(recent, current.recent)), loading: false,
      }));
      const empty = !days.length && !recent.length;
      setStatuses((current) => ({ ...current, [driverId]: empty ? 'empty' : 'idle' }));
      return empty ? 'empty' : 'success';
    } catch (error) {
      if (overviewRequest.current !== controller) return 'cancelled';
      controller.abort();
      if (error instanceof ApiError && error.status === 401) unauthorizedRef.current();
      setState((current) => ({ ...current, loading: false, error: errorMessage(error) }));
      setStatuses((current) => ({ ...current, [driverId]: 'error' }));
      return 'error';
    } finally {
      window.clearTimeout(timeout);
      if (overviewRequest.current === controller) overviewRequest.current = null;
    }
  }, [token, cancel]);

  const selectDay = useCallback(async (day: string) => {
    if (!token || state.driverId === null) return;
    dayRequest.current?.abort();
    const controller = new AbortController();
    dayRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    const driverId = state.driverId;
    setState((current) => ({
      ...current, selectedDay: day, range: [...FULL_DAY], rangeActive: true,
      dayPoints: [], dayLoading: true, dayError: '',
    }));
    try {
      // Load once per selected day. Dragging either handle filters locally, without network requests.
      const points = await api.locationHistory(token, driverId, controller.signal, {
        from: new Date(rangeTimestamp(day, FULL_DAY[0])).toISOString(),
        to: new Date(rangeTimestamp(day, FULL_DAY[1])).toISOString(),
      });
      if (dayRequest.current !== controller) return;
      setState((current) => ({ ...current, dayLoading: false,
        dayPoints: mergePoints(points, current.dayPoints) }));
    } catch (error) {
      if (dayRequest.current !== controller) return;
      if (error instanceof ApiError && error.status === 401) unauthorizedRef.current();
      setState((current) => ({ ...current, dayLoading: false, dayError: errorMessage(error) }));
    } finally {
      window.clearTimeout(timeout);
      if (dayRequest.current === controller) dayRequest.current = null;
    }
  }, [token, state.driverId]);

  const changeRange = useCallback((range: TimeRange) => {
    setState((current) => ({ ...current, range, rangeActive: true }));
  }, []);
  const resetRange = useCallback(() => {
    setState((current) => ({ ...current, rangeActive: false, selectedDay: null,
      range: [...FULL_DAY], dayLoading: false, dayError: '', dayPoints: [] }));
    dayRequest.current?.abort();
    dayRequest.current = null;
  }, []);

  const appendLocation = useCallback((location: DriverLocation) => {
    const timestamp = Date.parse(location.recordedAt);
    if (!Number.isFinite(timestamp) || timestamp > Date.now()) return;
    const date = historyDayKey(timestamp);
    setState((current) => {
      if (current.driverId !== location.userId) return current;
      return {
        ...current,
        days: [...new Map([{ date }, ...current.days].map((day) => [day.date, day])).values()]
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
        recent: recentPoints(mergePoints(current.recent, [location])),
        dayPoints: current.selectedDay === date
          ? mergePoints(current.dayPoints, [location]) : current.dayPoints,
      };
    });
    setStatuses((current) => current[location.userId] === 'empty'
      ? { ...current, [location.userId]: 'idle' } : current);
  }, []);

  const deferredRange = useDeferredValue(state.range);
  const points = useMemo(() => state.rangeActive && state.selectedDay
    ? filterHistoryRange(state.dayPoints, state.selectedDay, deferredRange) : state.recent,
  [state.rangeActive, state.selectedDay, state.dayPoints, state.recent, deferredRange]);

  return { ...state, points, statuses, open, close, selectDay, changeRange, resetRange, appendLocation };
}
