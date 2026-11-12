import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMyTasks } from '@/hooks/use-my-tasks';
import type { DriverTask, TaskMapPayload } from '@/types/task';
import { formatTaskTimestamp, taskElapsed } from '@/utils/task-time';
import { deleteSavedDestination, openDestination, savedDestinations, saveDestination, shareDestination, type SavedDestination } from '@/services/destinations';
import { CompleteTaskDialog } from './CompleteTaskDialog';
import { DriverTaskMap } from './DriverTaskMap';

interface Props {
  token: string; userId: number;
  currentLocation: { latitude: number; longitude: number } | null;
  onLocateMe: () => Promise<void>; locating: boolean;
  onFocusMap: () => void;
  onUnauthorized: () => void;
}
export function DriverTasks({ token, userId, currentLocation, onLocateMe, locating, onFocusMap, onUnauthorized }: Props) {
  const state = useMyTasks(token, userId, onUnauthorized);
  const { tasks, loading, error, pending, refresh, complete } = state;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [locationFocusRequest, setLocationFocusRequest] = useState(0);
  const [filter, setFilter] = useState<'pending' | 'completed'>('pending');
  const [confirming, setConfirming] = useState<DriverTask | null>(null);
  const [confirmAttempted, setConfirmAttempted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [favorites, setFavorites] = useState<SavedDestination[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState('');
  const handledNotification = useRef(0);
  const actionBusy = useRef(false);
  const focusIntent = useRef(0);
  const pendingTasks = useMemo(() => tasks.filter(task => task.status === 'pending'), [tasks]);
  const shown = tasks.filter(task => task.status === filter);
  const payload = useMemo<TaskMapPayload>(() => ({
    type: 'delivery:tasks-map', selectedTaskId: selectedId, focusRequest, locationFocusRequest, currentLocation,
    tasks: pendingTasks.map(task => ({ id: task.id, placeName: task.placeName, latitude: Number(task.latitude), longitude: Number(task.longitude) })),
  }), [pendingTasks, selectedId, focusRequest, locationFocusRequest, currentLocation]);
  const selectTask = (id: number, showMap = false) => {
    focusIntent.current += 1; setSelectedId(id); setFocusRequest(value => value + 1); setFilter('pending');
    if (showMap) onFocusMap();
  };

  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') setNow(Date.now()); }, 30_000);
    const listener = AppState.addEventListener('change', status => { if (status === 'active') setNow(Date.now()); });
    let alive = true;
    void savedDestinations(userId).then(value => { if (alive) setFavorites(value); }).catch(() => {});
    return () => { alive = false; clearInterval(timer); listener.remove(); };
  }, [userId]);

  useEffect(() => {
    const selection = state.notificationSelection;
    if (selection && selection.nonce !== handledNotification.current && pendingTasks.some(task => task.id === selection.id)) {
      handledNotification.current = selection.nonce;
      focusIntent.current += 1;
      setSelectedId(selection.id); setFocusRequest(value => value + 1); setFilter('pending');
      onFocusMap();
    }
  }, [state.notificationSelection, pendingTasks, onFocusMap]);

  const actOnDestination = async (point: SavedDestination, action: 'neshan' | 'share' | 'save') => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setActionMessage(null);
    try {
      if (action === 'save') {
        setFavorites(await saveDestination(userId, point));
        setActionMessage({ text: 'مقصد در گوشی ذخیره شد.', error: false });
      } else if (action === 'neshan') await openDestination(point);
      else {
        const message = await shareDestination(point);
        if (message) setActionMessage({ text: message, error: false });
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setActionMessage({ text: cause instanceof Error ? cause.message : 'انجام این کار ممکن نشد.', error: true });
    } finally { actionBusy.current = false; }
  };
  const announcementKey = state.announcement ? `${state.announcement.id}:${state.announcement.revision}` : '';

  return <View style={styles.section}>
    <View style={styles.heading}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="به‌روزرسانی دستی وظایف" disabled={state.refreshing}
        onPress={() => { void refresh(); }} style={[styles.refresh, state.refreshing && styles.disabled]}>
        {state.refreshing ? <ActivityIndicator size="small" color="#0f9475" /> : <Text style={styles.refreshSymbol}>↻</Text>}
        <Text style={styles.refreshText}>به‌روزرسانی دستی</Text>
      </TouchableOpacity>
      <View><Text style={styles.title}>وظایف من</Text><Text style={styles.subtitle}>{pendingTasks.length.toLocaleString('fa-IR')} مقصد در انتظار انجام</Text></View>
    </View>
    <View style={styles.syncRow}><Text style={styles.syncTime}>{state.lastUpdated ? `آخرین دریافت: ${new Date(state.lastUpdated).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'در حال دریافت…'}</Text><Text style={[styles.syncStatus, state.realtime && styles.connected]}>{state.realtime ? '● اتصال لحظه‌ای' : '○ در حال بازیابی اتصال'}</Text></View>
    {state.announcement && announcementKey !== dismissedAnnouncement && <View style={styles.announcement}>
      <TouchableOpacity accessibilityLabel="بستن اعلان وظیفه" onPress={() => setDismissedAnnouncement(announcementKey)}><Text style={styles.dismiss}>×</Text></TouchableOpacity>
      <TouchableOpacity style={styles.announcementText} accessibilityRole="button" onPress={() => selectTask(state.announcement!.id, true)}><Text style={styles.announcementTitle}>وظیفهٔ جدید دریافت شد</Text><Text style={styles.announcementBody}>{state.announcement.placeName}</Text></TouchableOpacity>
    </View>}
    {state.pushStatus !== 'unsupported' && <View style={styles.notificationRow}>
      {['permission', 'error'].includes(state.pushStatus) && <TouchableOpacity disabled={state.registeringPush} onPress={() => { void state.enableNotifications(); }}><Text style={styles.notificationAction}>{state.registeringPush ? 'در حال بررسی…' : 'فعال‌سازی اعلان‌ها'}</Text></TouchableOpacity>}
      <Text style={styles.notificationText}>{state.pushStatus === 'ready' ? 'اعلان وظایف روی گوشی فعال است.' : state.pushStatus === 'unavailable' ? 'اعلان‌های گوشی در این نسخه در دسترس نیستند.' : 'برای دریافت وظیفه هنگام بسته‌بودن برنامه، اعلان‌ها را فعال کنید.'}</Text>
    </View>}

    <DriverTaskMap payload={payload} onSelectTask={selectTask} onDestinationAction={(id, action) => {
      const task = pendingTasks.find(item => item.id === id);
      if (task) void actOnDestination({ placeId: task.placeId, name: task.placeName, latitude: Number(task.latitude), longitude: Number(task.longitude) }, action);
    }} />
    <View style={styles.mapControls}>
      <TouchableOpacity style={styles.mapButton} disabled={locating} accessibilityRole="button" onPress={() => {
        setActionMessage(null);
        const intent = ++focusIntent.current;
        void onLocateMe().then(() => { if (intent === focusIntent.current) setLocationFocusRequest(value => value + 1); })
          .catch(cause => setActionMessage({ text: cause instanceof Error ? cause.message : 'موقعیت دریافت نشد.', error: true }));
      }}>{locating ? <ActivityIndicator size="small" color="#2563eb" /> : <Text style={styles.mapButtonText}>◎ موقعیت من</Text>}</TouchableOpacity>
      <TouchableOpacity style={styles.mapButton} accessibilityRole="button" onPress={() => setShowFavorites(value => !value)}><Text style={styles.mapButtonText}>☆ مقصدهای ذخیره‌شده ({favorites.length.toLocaleString('fa-IR')})</Text></TouchableOpacity>
    </View>
    <Text style={styles.mapHint}>برای گزینه‌های نشان، اشتراک‌گذاری و ذخیره، نشان مقصد را لمس کنید.</Text>
    {!!actionMessage && <Text accessibilityRole={actionMessage.error ? 'alert' : 'text'} style={[styles.actionMessage, actionMessage.error && styles.actionError]}>{actionMessage.text}</Text>}
    {showFavorites && <View style={styles.favorites}>
      {!favorites.length && <Text style={styles.emptyText}>هنوز مقصدی در گوشی ذخیره نکرده‌اید.</Text>}
      {favorites.map(point => <View key={point.placeId} style={styles.favoriteRow}>
        <Text style={styles.favoriteName}>{point.name}</Text>
        <View style={styles.favoriteActions}>
          <TouchableOpacity accessibilityRole="button" onPress={() => { void actOnDestination(point, 'neshan'); }}><Text style={styles.favoriteAction}>باز کردن در نشان</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { void actOnDestination(point, 'share'); }}><Text style={styles.favoriteAction}>اشتراک‌گذاری</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`حذف مقصد ذخیره‌شده ${point.name}`} onPress={() => {
            void deleteSavedDestination(userId, point.placeId).then(setFavorites).catch(() => setActionMessage({ text: 'حذف مقصد ممکن نشد.', error: true }));
          }}><Text style={styles.favoriteDelete}>حذف</Text></TouchableOpacity>
        </View>
      </View>)}
    </View>}

    <View style={styles.filters}>{(['completed', 'pending'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'pending' ? 'در انتظار انجام' : 'انجام‌شده'}</Text></TouchableOpacity>)}</View>
    {!!error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => { void refresh(); }}><Text style={styles.retry}>تلاش مجدد</Text></TouchableOpacity></View>}
    {loading ? <View style={styles.empty}><ActivityIndicator color="#0f9475" /><Text style={styles.emptyText}>در حال دریافت وظایف…</Text></View>
      : !shown.length ? <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>{filter === 'pending' ? 'فعلاً وظیفه‌ای ندارید' : 'هنوز وظیفه‌ای انجام نشده است'}</Text><Text style={styles.emptyText}>وظایفی که مدیر برای شما ثبت کند، اینجا نمایش داده می‌شوند.</Text></View>
      : shown.map(task => {
        const done = task.status === 'completed';
        const busy = pending.has(task.id);
        const eventTime = done ? task.completedAt || task.updatedAt : task.assignedAt;
        return <View key={task.id} style={[styles.task, selectedId === task.id && !done && styles.taskSelected]}>
          <View style={styles.taskRow}>
            <TouchableOpacity style={styles.complete} accessibilityRole="checkbox" accessibilityLabel={`انجام وظیفه ${task.placeName}`} accessibilityState={{ checked: done, disabled: busy || done }} disabled={busy || done}
              onPress={() => { setConfirmAttempted(false); setConfirming(task); }}>{busy ? <ActivityIndicator size="small" color="#0f9475" /> : <Text style={[styles.checkbox, done && styles.checked]}>{done ? '✓' : '○'}</Text>}</TouchableOpacity>
            <TouchableOpacity disabled={done} style={styles.destination} onPress={() => selectTask(task.id, true)} accessibilityLabel={`نمایش ${task.placeName} روی نقشه`}><Text style={styles.taskTitle}>{task.placeName}</Text><Text style={styles.taskStatus}>{done ? 'انجام‌شده' : 'نمایش نزدیک مقصد روی نقشه ←'}</Text></TouchableOpacity>
            <View style={styles.building}><Text style={styles.buildingText}>▥</Text></View>
          </View>
          {!!task.description && <View style={styles.instructions}><Text style={styles.instructionsLabel}>توضیحات وظیفه</Text><Text style={styles.instructionsText}>{task.description}</Text></View>}
          <View style={styles.taskTimes}><Text style={styles.exactTime}>تخصیص: {formatTaskTimestamp(task.assignedAt)}</Text>
            {done && <Text style={styles.exactTime}>انجام: {formatTaskTimestamp(eventTime)}</Text>}
            <Text style={[styles.elapsed, done && styles.connected]}>{taskElapsed(eventTime, now)} از {done ? 'انجام وظیفه' : 'تخصیص وظیفه'} گذشته است.</Text>
          </View>
        </View>;
      })}
    {confirming && <CompleteTaskDialog task={confirming} busy={pending.has(confirming.id)} error={confirmAttempted ? error : ''}
      onClose={() => { if (!pending.has(confirming.id)) setConfirming(null); }}
      onConfirm={() => { setConfirmAttempted(true); void complete(confirming).then(succeeded => { if (succeeded) setConfirming(null); }); }} />}
  </View>;
}

const styles = StyleSheet.create({
  section: { width: '100%', marginBottom: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  title: { color: '#172d2d', fontSize: 24, fontWeight: '800', textAlign: 'right' },
  subtitle: { color: '#84958f', fontSize: 12, textAlign: 'right', marginTop: 6 },
  refresh: { minHeight: 43, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#e4f6ee', borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshSymbol: { color: '#0f9475', fontSize: 22 }, refreshText: { fontSize: 11, color: '#0f9475', fontWeight: '700' }, disabled: { opacity: .6 },
  syncRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13, gap: 8 },
  syncTime: { color: '#94a3b8', fontSize: 10 }, syncStatus: { color: '#b78e49', fontSize: 10 }, connected: { color: '#0f9475' },
  announcement: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 13, backgroundColor: '#e2f6ed', marginBottom: 13, borderWidth: 1, borderColor: '#a9dec6' },
  dismiss: { fontSize: 24, color: '#6b9b83' }, announcementText: { flex: 1 },
  announcementTitle: { textAlign: 'right', color: '#167b58', fontWeight: '700', fontSize: 12 }, announcementBody: { textAlign: 'right', color: '#496e60', fontSize: 13, marginTop: 5 },
  notificationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 13 },
  notificationAction: { color: '#0f9475', fontSize: 11, fontWeight: '700' }, notificationText: { color: '#84958f', fontSize: 10, textAlign: 'right', flexShrink: 1, lineHeight: 19 },
  mapControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }, mapButton: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#e8eef9', minHeight: 36, justifyContent: 'center' },
  mapButtonText: { color: '#42618c', fontSize: 11, fontWeight: '600' },
  mapHint: { color: '#94a3b8', fontSize: 10, textAlign: 'right', marginTop: 10, marginBottom: 16, lineHeight: 19 },
  actionMessage: { color: '#0f766e', fontSize: 12, lineHeight: 22, textAlign: 'right', marginBottom: 13 }, actionError: { color: '#b91c1c' },
  favorites: { padding: 13, borderRadius: 12, backgroundColor: '#fff', marginBottom: 14, borderWidth: 1, borderColor: '#e5ece7' }, favoriteRow: { paddingVertical: 11, gap: 11 },
  favoriteName: { textAlign: 'right', color: '#33473f', fontWeight: '700' }, favoriteActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 15 },
  favoriteAction: { color: '#42618c', fontSize: 11 }, favoriteDelete: { color: '#b91c1c', fontSize: 11 },
  filters: { flexDirection: 'row', borderRadius: 12, padding: 4, backgroundColor: '#eaf0ec', gap: 5, marginBottom: 13 }, filter: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  filterActive: { backgroundColor: '#fff' }, filterText: { color: '#94a3b8', fontSize: 12 }, filterTextActive: { color: '#0f9475', fontWeight: '700' },
  task: { padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5ece7', borderRadius: 15, marginBottom: 10 }, taskSelected: { borderColor: '#58c5a2', backgroundColor: '#f0fcf6' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, complete: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' }, checkbox: { color: '#a3b6af', fontSize: 29 }, checked: { color: '#0f9475' },
  destination: { flex: 1, gap: 7 }, taskTitle: { color: '#33473f', fontSize: 15, fontWeight: '700', textAlign: 'right' }, taskStatus: { color: '#879b91', fontSize: 11, textAlign: 'right' },
  building: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0ebff', alignItems: 'center', justifyContent: 'center' }, buildingText: { fontSize: 29, color: '#7c3aed' },
  instructions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5ece7', gap: 6 }, instructionsLabel: { color: '#0f766e', fontSize: 11, fontWeight: '700', textAlign: 'right' }, instructionsText: { color: '#475569', fontSize: 13, lineHeight: 23, textAlign: 'right', writingDirection: 'rtl' },
  taskTimes: { borderTopWidth: 1, borderTopColor: '#edf2ef', marginTop: 13, paddingTop: 11, gap: 7 }, exactTime: { color: '#84958f', textAlign: 'right', fontSize: 10, lineHeight: 19 }, elapsed: { color: '#a77d3c', textAlign: 'right', fontSize: 11, lineHeight: 20 },
  empty: { paddingVertical: 25, paddingHorizontal: 15, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#dbe5df', borderRadius: 14, backgroundColor: '#ffffffaa' }, emptyIcon: { color: '#0f9475', fontSize: 30 }, emptyTitle: { color: '#64748b', fontWeight: '700', textAlign: 'center' }, emptyText: { color: '#94a3b8', fontSize: 11, lineHeight: 22, textAlign: 'center' },
  error: { padding: 13, borderRadius: 11, backgroundColor: '#fff1f2', marginBottom: 12, gap: 10 }, errorText: { color: '#b91c1c', fontSize: 12, lineHeight: 21, textAlign: 'right' }, retry: { color: '#0f9475', fontSize: 12, textAlign: 'right', fontWeight: '700' },
});
