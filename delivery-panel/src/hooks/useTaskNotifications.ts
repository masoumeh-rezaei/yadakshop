import { useCallback, useEffect, useRef, useState } from 'react';
import type { DriverTask } from '../types';
import { CompletionSound } from '../utils/completionSound';
import { deliverCompletionAcrossTabs } from '../utils/completionDeliveryStore';
import { completionKey, readCompletionNotice, type TaskCompletionNotice } from '../utils/taskCompletion';

export function useTaskNotifications(tasks: DriverTask[], loaded: boolean, adminId: number | undefined, onOpen: (taskId: number) => void) {
  const [notices, setNotices] = useState<TaskCompletionNotice[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission);
  const seen = useRef(new Set<string>());
  const baseline = useRef<Map<number, DriverTask> | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundPreference(adminId));
  const [soundReady, setSoundReady] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [unread, setUnread] = useState(0);
  const sound = useRef<CompletionSound | null>(null);
  const activeNotifications = useRef(new Set<Notification>());
  const alive = useRef(false);
  const settings = useRef({ adminId, soundEnabled });
  settings.current = { adminId, soundEnabled };
  const originalTitle = useRef(document.title);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => {
    alive.current = true;
    const audio = new CompletionSound();
    sound.current = audio;
    const enabled = readSoundPreference(adminId);
    settings.current.soundEnabled = enabled;
    setSoundEnabled(enabled); setSoundReady(false); setFeedback('');
    seen.current.clear(); baseline.current = null; setNotices([]); setUnread(0);
    const unlock = () => {
      if (settings.current.soundEnabled) void audio.unlock().then(ready => {
        if (alive.current && sound.current === audio) setSoundReady(ready);
      });
    };
    const sync = () => {
      const enabled = readSoundPreference(adminId, settings.current.soundEnabled);
      settings.current.soundEnabled = enabled; setSoundEnabled(enabled);
      if (!enabled) audio.stop();
      setPermission(desktopPermission());
      if (!document.hidden) setUnread(0);
    };
    const onStorage = (event: StorageEvent) => { if (event.key === soundPreferenceKey(adminId) || event.key === null) sync(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      alive.current = false; sound.current = null; audio.dispose();
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
      window.removeEventListener('storage', onStorage); window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      for (const notification of activeNotifications.current) notification.close();
      activeNotifications.current.clear();
    };
  }, [adminId]);

  useEffect(() => {
    document.title = unread && document.hidden ? `🔔 (${unread.toLocaleString('fa-IR')}) وظیفه انجام شد | ${originalTitle.current}` : originalTitle.current;
    return () => { document.title = originalTitle.current; };
  }, [unread]);

  const notify = useCallback((value: unknown) => {
    const notice = readCompletionNotice(value);
    if (!notice) return;
    const key = completionKey(notice);
    if (seen.current.has(key)) return;
    seen.current.add(key);
    if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
    setNotices(current => [notice, ...current].slice(0, 10));
    setInboxOpen(true);
    if (document.hidden) setUnread(count => count + 1);
    if (adminId === undefined) return;
    void deliverCompletionAcrossTabs(`delivery.completed-notifications.${adminId}`, key, remaining => {
      if (!alive.current || settings.current.adminId !== adminId) return { sound: false, desktop: false };
      const enabled = settings.current.soundEnabled;
      const sounded = remaining.sound && enabled && Boolean(sound.current?.play());
      let desktop = false;
      if (remaining.desktop && desktopPermission() === 'granted') try {
        const notification = new Notification('وظیفه انجام شد', {
          body: `${notice.driverName || notice.driverPhone} وظیفهٔ «${notice.placeName}» را انجام داد.`,
          tag: `delivery-completed-${adminId}-${key}`, lang: 'fa', dir: 'rtl',
          requireInteraction: true, silent: !enabled || sounded,
        });
        activeNotifications.current.add(notification);
        notification.onclose = () => { activeNotifications.current.delete(notification); };
        notification.onclick = () => { if (alive.current) { window.focus(); setUnread(0); open.current(notice.id); } notification.close(); };
        desktop = true;
      } catch { /* Sound and the inbox remain available when desktop notifications fail. */ }
      return { sound: sounded, desktop };
    }).catch(() => { /* The in-panel notice is independent of external alert delivery. */ });
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

  const saveSound = (enabled: boolean) => {
    settings.current.soundEnabled = enabled; setSoundEnabled(enabled);
    try { localStorage.setItem(soundPreferenceKey(adminId), enabled ? 'on' : 'off'); } catch {}
  };
  const activate = async (test: boolean, forceSound: boolean) => {
    setInboxOpen(true); setFeedback('در حال بررسی اعلان و صدا…');
    if (forceSound) saveSound(true);
    // Both privileged browser calls begin in the original click, before awaiting either.
    const audio = sound.current;
    const pendingAudio = settings.current.soundEnabled ? audio?.unlock() : Promise.resolve(false);
    let pendingPermission: Promise<NotificationPermission | 'unsupported'>;
    try { pendingPermission = desktopPermission() === 'default' ? Promise.resolve(Notification.requestPermission()).catch(() => 'denied' as const) : Promise.resolve(desktopPermission()); }
    catch { pendingPermission = Promise.resolve('denied'); }
    const [ready, granted] = await Promise.all([pendingAudio, pendingPermission]);
    if (!alive.current || settings.current.adminId !== adminId || sound.current !== audio) return;
    setSoundReady(Boolean(ready)); setPermission(granted); setInboxOpen(true);
    const sounded = settings.current.soundEnabled && Boolean(ready) && Boolean(sound.current?.play());
    let desktop = false;
    if (test && granted === 'granted') try {
      const notification = new Notification('آزمایش اعلان وظایف', {
        body: 'وقتی پیک وظیفه‌ای را انجام دهد، نام پیک و مقصد اینجا نمایش داده می‌شود.',
        tag: `delivery-alert-test-${adminId}`, lang: 'fa', dir: 'rtl', silent: !settings.current.soundEnabled || sounded,
      });
      activeNotifications.current.add(notification);
      notification.onclose = () => { activeNotifications.current.delete(notification); };
      notification.onclick = () => { window.focus(); notification.close(); };
      desktop = true;
    } catch {}
    setFeedback([
      !settings.current.soundEnabled ? 'صدای هشدار خاموش است.' : sounded ? 'صدای آزمایشی پخش شد.' : 'صدا فعال نشد؛ دوباره روی فعال‌سازی بزنید و تنظیمات صدای سایت را بررسی کنید.',
      granted === 'granted' ? test && !desktop ? 'نمایش اعلان سیستم ناموفق بود؛ تنظیمات مرورگر را بررسی کنید.' : 'اعلان سیستم فعال است.' : granted === 'denied' ? 'برای اعلان دسکتاپ، اجازهٔ Notifications این سایت را در تنظیمات مرورگر فعال کنید.' : 'اعلان سیستم در این مرورگر در دسترس نیست.',
    ].join(' '));
  };
  const enableDesktop = () => activate(false, true);
  const testAlert = () => activate(true, false);
  const toggleSound = async () => {
    const enabled = !settings.current.soundEnabled; saveSound(enabled);
    if (!enabled) { sound.current?.stop(); setFeedback('صدای هشدار خاموش شد.'); return; }
    const audio = sound.current;
    const ready = await audio?.unlock();
    if (!alive.current || settings.current.adminId !== adminId || sound.current !== audio) return;
    setSoundReady(Boolean(ready));
    const played = ready && sound.current?.play();
    setFeedback(played ? 'صدای هشدار فعال شد.' : 'برای فعال‌سازی صدا، تنظیمات صدای سایت را بررسی کنید.');
  };
  const dismiss = (notice: TaskCompletionNotice) => setNotices(current => current.filter(item => completionKey(item) !== completionKey(notice)));
  return { notices, notify, inboxOpen, setInboxOpen, permission, enableDesktop, dismiss,
    soundEnabled, soundReady, feedback, toggleSound, testAlert };
}

function desktopPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission;
}
function soundPreferenceKey(adminId: number | undefined) { return `delivery.task-alert-sound.${adminId}`; }
function readSoundPreference(adminId: number | undefined, fallback = true) {
  try { const saved = localStorage.getItem(soundPreferenceKey(adminId)); return saved === null ? fallback : saved !== 'off'; } catch { return fallback; }
}
