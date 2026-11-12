import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { API_URL, ApiError, completeMyTask, getMyTasks } from '@/services/api';
import { registerTaskNotifications, subscribeTaskNotifications, type PushStatus } from '@/services/push-notifications';
import type { DriverTask } from '@/types/task';

export function useMyTasks(token: string, userId: number, onUnauthorized: () => void) {
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [announcement, setAnnouncement] = useState<DriverTask | null>(null);
  const [notificationSelection, setNotificationSelection] = useState<{ id: number; nonce: number } | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported');
  const [registeringPush, setRegisteringPush] = useState(false);
  const registration = useRef(false);
  const pendingRef = useRef(new Set<number>());
  const mutations = useRef(new Set<AbortController>());
  const request = useRef<AbortController | null>(null);
  const queued = useRef(false);
  const alive = useRef(true);
  const known = useRef<Map<number, string> | null>(null);
  const refreshedAt = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  const reportError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) unauthorized.current();
    if (alive.current) setError(cause instanceof Error ? cause.message : 'دریافت وظایف ناموفق بود.');
  }, []);

  const refresh = useCallback(async () => {
    if (pendingRef.current.size || request.current) { queued.current = true; return; }
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const result = (await getMyTasks(token, controller.signal))
        .filter(task => task.driverId === userId && task.status !== 'cancelled');
      if (request.current !== controller || !alive.current) return;
      const fresh = known.current && result.find(task => task.status === 'pending'
        && known.current!.get(task.id) !== `${task.revision}:${task.status}`);
      if (fresh) setAnnouncement(fresh);
      known.current = new Map(result.map(task => [task.id, `${task.revision}:${task.status}`]));
      setTasks(result);
      setError('');
      refreshedAt.current = Date.now();
      setLastUpdated(refreshedAt.current);
    } catch (cause) {
      if (request.current === controller && alive.current) reportError(cause);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (alive.current) { setLoading(false); setRefreshing(false); }
        if (queued.current && alive.current) { queued.current = false; void refreshRef.current(); }
      }
    }
  }, [token, userId, reportError]);
  refreshRef.current = refresh;

  const enableNotifications = useCallback(async (requestPermission = true) => {
    if (registration.current) return;
    registration.current = true;
    setRegisteringPush(true);
    try {
      const status = await registerTaskNotifications(token, requestPermission);
      if (alive.current) setPushStatus(status);
    } finally {
      registration.current = false;
      if (alive.current) setRegisteringPush(false);
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    known.current = null;
    const socket = io(API_URL, { auth: { token }, autoConnect: false,
      transports: ['websocket', 'polling'], reconnectionDelay: 1000, reconnectionDelayMax: 10_000 });
    socket.on('connect', () => { setRealtime(true); void refresh(); });
    socket.on('disconnect', () => { if (alive.current) setRealtime(false); });
    socket.on('connect_error', () => { if (alive.current) setRealtime(false); });
    socket.on('tasks:changed', () => { void refresh(); });
    const foreground = () => {
      if (AppState.currentState === 'active') {
        socket.connect(); void refresh(); void enableNotifications(false);
      } else socket.disconnect();
    };
    foreground();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && (!socket.connected || Date.now() - refreshedAt.current >= 60_000)) void refresh();
    }, 5000);
    const subscription = AppState.addEventListener('change', foreground);
    const unsubscribePush = subscribeTaskNotifications(() => { void refresh(); }, id => {
      if (alive.current) setNotificationSelection({ id, nonce: Date.now() });
    }, () => { void enableNotifications(false); });
    return () => {
      alive.current = false;
      queued.current = false;
      request.current?.abort(); request.current = null;
      for (const controller of mutations.current) controller.abort();
      socket.removeAllListeners(); socket.disconnect();
      clearInterval(timer); subscription.remove(); unsubscribePush();
    };
  }, [token, refresh, enableNotifications]);

  const complete = useCallback(async (task: DriverTask): Promise<boolean> => {
    if (task.driverId !== userId || task.status !== 'pending' || pendingRef.current.has(task.id)) return false;
    pendingRef.current.add(task.id);
    setPending(new Set(pendingRef.current));
    request.current?.abort(); request.current = null;
    setRefreshing(false);
    const controller = new AbortController();
    mutations.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setError('');
    let succeeded = false;
    try {
      const updated = await completeMyTask(token, task, controller.signal);
      if (alive.current && updated.driverId === userId) {
        setTasks(current => current.map(item => item.id === updated.id ? updated : item));
        known.current?.set(updated.id, `${updated.revision}:${updated.status}`);
        succeeded = true;
      }
    } catch (cause) { if (!controller.signal.aborted || alive.current) reportError(cause); }
    finally {
      clearTimeout(timeout); mutations.current.delete(controller);
      pendingRef.current.delete(task.id);
      if (alive.current) {
        setPending(new Set(pendingRef.current)); setLoading(false);
        if (!pendingRef.current.size) { queued.current = false; void refreshRef.current(); }
      }
    }
    return succeeded;
  }, [token, userId, reportError]);

  return { tasks, loading, refreshing, lastUpdated, realtime, error, pending, refresh, complete,
    announcement, notificationSelection, pushStatus, registeringPush, enableNotifications };
}
