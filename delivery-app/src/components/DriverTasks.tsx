import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMyTasks } from '@/hooks/use-my-tasks';
import type { TaskMapPayload } from '@/types/task';
import { DriverTaskMap } from './DriverTaskMap';

interface Props {
  token: string;
  userId: number;
  currentLocation: { latitude: number; longitude: number } | null;
  onUnauthorized: () => void;
}
export function DriverTasks({ token, userId, currentLocation, onUnauthorized }: Props) {
  const { tasks, loading, error, pending, refresh, complete } = useMyTasks(token, userId, onUnauthorized);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [filter, setFilter] = useState<'pending' | 'completed'>('pending');
  const pendingTasks = useMemo(() => tasks.filter((task) => task.status === 'pending'), [tasks]);
  const shown = tasks.filter((task) => task.status === filter);
  const payload = useMemo<TaskMapPayload>(() => ({
    type: 'delivery:tasks-map', selectedTaskId: selectedId, focusRequest, currentLocation,
    tasks: pendingTasks.map((task) => ({ id: task.id, placeName: task.placeName, latitude: Number(task.latitude), longitude: Number(task.longitude) })),
  }), [pendingTasks, selectedId, focusRequest, currentLocation]);
  const selectTask = (id: number) => { setSelectedId(id); setFocusRequest((value) => value + 1); setFilter('pending'); };
  return <View style={styles.section}>
    <View style={styles.heading}><TouchableOpacity accessibilityLabel="به‌روزرسانی وظایف" onPress={() => { void refresh(); }} style={styles.refresh}><Text style={styles.refreshText}>به‌روزرسانی ↻</Text></TouchableOpacity><View><Text style={styles.title}>وظایف من</Text><Text style={styles.subtitle}>{pendingTasks.length.toLocaleString('fa-IR')} مقصد در انتظار انجام</Text></View></View>
    <DriverTaskMap payload={payload} onSelectTask={selectTask} />
    <Text style={styles.mapHint}>مقصدها با نشان ساختمان روی نقشه مشخص شده‌اند.</Text>
    <View style={styles.filters}>{(['completed', 'pending'] as const).map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'pending' ? 'در انتظار انجام' : 'انجام‌شده'}</Text></TouchableOpacity>)}</View>
    {!!error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => { void refresh(); }}><Text style={styles.retry}>تلاش مجدد</Text></TouchableOpacity></View>}
    {loading ? <View style={styles.empty}><ActivityIndicator color="#0f9475" /><Text style={styles.emptyText}>در حال دریافت وظایف…</Text></View>
      : !shown.length ? <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>{filter === 'pending' ? 'فعلاً وظیفه‌ای ندارید' : 'هنوز وظیفه‌ای انجام نشده است'}</Text><Text style={styles.emptyText}>وظایفی که مدیر برای شما ثبت کند، اینجا نمایش داده می‌شوند.</Text></View>
      : shown.map((task) => {
        const done = task.status === 'completed';
        const busy = pending.has(task.id);
        return <View key={task.id} style={[styles.task, selectedId === task.id && !done && styles.taskSelected]}>
          <View style={styles.taskRow}>
            <TouchableOpacity style={styles.complete} accessibilityRole="checkbox" accessibilityLabel={`انجام وظیفه ${task.placeName}`} accessibilityState={{ checked: done, disabled: busy || done }} disabled={busy || done} onPress={() => { void complete(task); }}>{busy ? <ActivityIndicator size="small" color="#0f9475" /> : <Text style={[styles.checkbox, done && styles.checked]}>{done ? '✓' : '○'}</Text>}</TouchableOpacity>
            <TouchableOpacity disabled={done} style={styles.destination} onPress={() => selectTask(task.id)} accessibilityLabel={`نمایش ${task.placeName} روی نقشه`}><Text style={styles.taskTitle}>{task.placeName}</Text><Text style={styles.taskStatus}>{done ? 'انجام‌شده' : 'نمایش مقصد روی نقشه ←'}</Text></TouchableOpacity>
            <View style={styles.building}><Text style={styles.buildingText}>▥</Text></View>
          </View>
        </View>;
      })}
  </View>;
}
const styles = StyleSheet.create({
  section: { width: '100%', marginBottom: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: '#172d2d', fontSize: 24, fontWeight: '800', textAlign: 'right' },
  subtitle: { color: '#84958f', fontSize: 12, textAlign: 'right', marginTop: 6 },
  refresh: { paddingVertical: 8, paddingHorizontal: 11, backgroundColor: '#e4f6ee', borderRadius: 10 },
  refreshText: { fontSize: 11, color: '#0f9475', fontWeight: '700' },
  mapHint: { color: '#94a3b8', fontSize: 10, textAlign: 'right', marginTop: 9, marginBottom: 16 },
  filters: { flexDirection: 'row', borderRadius: 12, padding: 4, backgroundColor: '#eaf0ec', gap: 5, marginBottom: 13 },
  filter: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  filterActive: { backgroundColor: '#fff' },
  filterText: { color: '#94a3b8', fontSize: 12 },
  filterTextActive: { color: '#0f9475', fontWeight: '700' },
  task: { padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5ece7', borderRadius: 15, marginBottom: 10 },
  taskSelected: { borderColor: '#58c5a2', backgroundColor: '#f0fcf6' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  complete: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  checkbox: { color: '#a3b6af', fontSize: 29 },
  checked: { color: '#0f9475' },
  destination: { flex: 1, gap: 7 },
  taskTitle: { color: '#33473f', fontSize: 15, fontWeight: '700', textAlign: 'right' },
  taskStatus: { color: '#879b91', fontSize: 11, textAlign: 'right' },
  building: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0ebff', alignItems: 'center', justifyContent: 'center' },
  buildingText: { fontSize: 29, color: '#7c3aed' },
  empty: { paddingVertical: 25, paddingHorizontal: 15, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#dbe5df', borderRadius: 14, backgroundColor: '#ffffffaa' },
  emptyIcon: { color: '#0f9475', fontSize: 30 },
  emptyTitle: { color: '#64748b', fontWeight: '700', textAlign: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 11, lineHeight: 22, textAlign: 'center' },
  error: { padding: 13, borderRadius: 11, backgroundColor: '#fff1f2', marginBottom: 12, gap: 10 },
  errorText: { color: '#b91c1c', fontSize: 12, lineHeight: 21, textAlign: 'right' },
  retry: { color: '#0f9475', fontSize: 12, textAlign: 'right', fontWeight: '700' },
});
