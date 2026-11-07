import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { DriverTask } from '../types';

export const assignmentKey = (driverId: number, placeId: number) => `${driverId}:${placeId}`;

export function useTasks(token: string | null, onUnauthorized: () => void) {
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const unauthorized = useRef(onUnauthorized);
  const mounted = useRef(true);
  unauthorized.current = onUnauthorized;

  const reportError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) unauthorized.current();
    const unavailable = cause instanceof ApiError && (cause.status === 404 || cause.status === 503);
    if (mounted.current) setError(unavailable
      ? 'نمایش جدید آماده است؛ ثبت و دریافت وظایف پس از آماده‌شدن سرویس وظایف فعال می‌شود.'
      : cause instanceof Error ? cause.message : 'ارتباط با بخش وظایف ناموفق بود.');
  }, []);

  const refresh = useCallback(async () => {
    if (!token || inFlight.current.size) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await api.tasks(token, controller.signal);
      if (request.current !== controller || !mounted.current) return;
      setTasks(result);
      setError('');
    } catch (cause) {
      if (request.current === controller && mounted.current) reportError(cause);
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, [token, reportError]);

  useEffect(() => {
    mounted.current = true;
    setTasks([]);
    setLoading(true);
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const mutate = useCallback(async (key: string, operation: () => Promise<DriverTask | null>) => {
    if (!token || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setPending(new Set(inFlight.current));
    request.current?.abort();
    request.current = null;
    setError('');
    let succeeded = false;
    try {
      const task = await operation();
      succeeded = true;
      if (!mounted.current) return;
      if (task) setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]
        .filter((item) => item.status !== 'cancelled'));
    } catch (cause) {
      reportError(cause);
    } finally {
      inFlight.current.delete(key);
      if (mounted.current) {
        setPending(new Set(inFlight.current));
        setLoading(false);
        // Reconcile socket events and other administrators' changes after all local writes finish.
        if (!inFlight.current.size && succeeded) void refresh();
      }
    }
  }, [token, refresh, reportError]);

  const assign = useCallback((driverId: number, placeId: number, assigned: boolean) =>
    mutate(assignmentKey(driverId, placeId), () => api.setAssignment(token!, driverId, placeId, assigned)), [mutate, token]);
  const complete = useCallback((task: DriverTask) =>
    mutate(assignmentKey(task.driverId, task.placeId), () => api.completeTask(token!, task)), [mutate, token]);

  return { tasks, loading, error, pending, refresh, assign, complete };
}
