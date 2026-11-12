import { useCallback, useEffect, useRef, useState } from 'react';
import type { DriverTask } from '../types';

export interface TaskCompletionNotice {
  id: number; revision: number; driverName: string | null; driverPhone: string;
  placeName: string; completedAt: string;
}
export const completionKey = (notice: Pick<TaskCompletionNotice, 'id' | 'revision'>) => `${notice.id}:${notice.revision}`;
export function readCompletionNotice(value: unknown): TaskCompletionNotice | null {
  const task = value as Partial<TaskCompletionNotice> | null;
  return task && Number.isSafeInteger(task.id) && Number(task.id) > 0 && Number.isSafeInteger(task.revision) && Number(task.revision) > 0
    && typeof task.placeName === 'string' && typeof task.driverPhone === 'string'
    && (typeof task.driverName === 'string' || task.driverName === null)
    && typeof task.completedAt === 'string' && Number.isFinite(Date.parse(task.completedAt))
    ? task as TaskCompletionNotice : null;
}

export function useTaskNotifications(tasks: DriverTask[], loaded: boolean, adminId: number | undefined, onOpen: (taskId: number) => void) {
  const [notices, setNotices] = useState<TaskCompletionNotice[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission);
  const seen = useRef(new Set<string>());
  const baseline = useRef<Map<number, DriverTask> | null>(null);
  const open = useRef(onOpen);
  open.current = onOpen;

  const notify = useCallback((value: unknown) => {
    const notice = readCompletionNotice(value);
    if (!notice) return;
    const key = completionKey(notice);
    if (seen.current.has(key)) return;
    seen.current.add(key);
    if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
    setNotices(current => [notice, ...current].slice(0, 10));
    setInboxOpen(true);
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const storeKey = `delivery.completed-notifications.${adminId}`;
    let delivered: string[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '[]');
      if (Array.isArray(saved)) delivered = saved.filter((item): item is string => typeof item === 'string');
    } catch { /* Private browsing can disable persistent storage. */ }
    if (delivered.includes(key)) return;
    try {
      const notification = new Notification('وظیفه انجام شد', {
        body: `${notice.driverName || notice.driverPhone} وظیفهٔ «${notice.placeName}» را انجام داد.`,
        tag: `delivery-completed-${key}`, lang: 'fa', dir: 'rtl',
      });
      notification.onclick = () => { window.focus(); open.current(notice.id); notification.close(); };
      try { localStorage.setItem(storeKey, JSON.stringify([...delivered, key].slice(-200))); } catch {}
    } catch { /* The in-panel inbox remains available when the OS disallows notifications. */ }
  }, [adminId]);

  useEffect(() => {
    if (!loaded) return;
    if (baseline.current) for (const task of tasks) {
      const previous = baseline.current.get(task.id);
      if (task.status === 'completed' && (!previous || previous.status !== 'completed' || previous.revision < task.revision)) {
        notify({ ...task, completedAt: task.completedAt || task.updatedAt });
      }
    }
    baseline.current = new Map(tasks.map(task => [task.id, task]));
  }, [tasks, loaded, notify]);

  const enableDesktop = async () => {
    if (typeof Notification === 'undefined' || !window.isSecureContext) { setPermission('unsupported'); return; }
    try { setPermission(await Notification.requestPermission()); } catch { setPermission('denied'); }
    setInboxOpen(true);
  };
  const dismiss = (notice: TaskCompletionNotice) => setNotices(current => current.filter(item => completionKey(item) !== completionKey(notice)));
  return { notices, notify, inboxOpen, setInboxOpen, permission, enableDesktop, dismiss };
}
