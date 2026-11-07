import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, completeMyTask, getMyTasks } from '@/services/api';
import type { DriverTask } from '@/types/task';

export function useMyTasks(token: string, userId: number, onUnauthorized: () => void) {
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const pendingRef = useRef(new Set<number>());
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  const reportError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) unauthorized.current();
    if (alive.current) setError(cause instanceof Error ? cause.message : 'دریافت وظایف ناموفق بود.');
  }, []);
  const refresh = useCallback(async () => {
    if (pendingRef.current.size) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await getMyTasks(token, controller.signal);
      if (request.current !== controller || !alive.current) return;
      // Defensive UI scoping in addition to the authenticated server-side query.
      setTasks(result.filter((task) => task.driverId === userId && task.status !== 'cancelled'));
      setError('');
    } catch (cause) {
      if (request.current === controller && alive.current) reportError(cause);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (alive.current) setLoading(false);
      }
    }
  }, [token, userId, reportError]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => {
      alive.current = false;
      request.current?.abort();
      request.current = null;
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  const complete = useCallback(async (task: DriverTask) => {
    if (task.driverId !== userId || pendingRef.current.has(task.id)) return;
    pendingRef.current.add(task.id);
    setPending(new Set(pendingRef.current));
    request.current?.abort();
    request.current = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setError('');
    try {
      const updated = await completeMyTask(token, task, controller.signal);
      if (alive.current) setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      reportError(cause);
    } finally {
      clearTimeout(timeout);
      pendingRef.current.delete(task.id);
      if (alive.current) { setPending(new Set(pendingRef.current)); setLoading(false); }
    }
  }, [token, userId, reportError]);
  return { tasks, loading, error, pending, refresh, complete };
}
