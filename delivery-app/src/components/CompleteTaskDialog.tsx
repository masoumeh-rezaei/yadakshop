import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DriverTask } from '@/types/task';

interface Props { task: DriverTask; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }
export function CompleteTaskDialog({ task, busy, error, onClose, onConfirm }: Props) {
  return <Modal transparent animationType="fade" visible onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no-hide-descendants" onPress={() => { if (!busy) onClose(); }} />
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.icon}><Text style={styles.check}>✓</Text></View>
        <Text style={styles.title} accessibilityRole="header">وظیفه را انجام داده‌اید؟</Text>
        <Text style={styles.message}>آیا مطمئنید وظیفهٔ زیر را کامل انجام داده‌اید؟ نتیجه برای مدیر ثبت و ارسال می‌شود.</Text>
        <View style={styles.destination}><Text style={styles.destinationLabel}>مقصد</Text><Text style={styles.destinationName}>{task.placeName}</Text></View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.actions}>
          <TouchableOpacity disabled={busy} onPress={onClose} style={styles.back} accessibilityRole="button"><Text style={styles.backText}>بازگشت</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={onConfirm} style={[styles.confirm, busy && styles.disabled]} accessibilityRole="button" accessibilityLabel="بله، انجام داده‌ام">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>بله، انجام داده‌ام</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a99' },
  card: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 22, backgroundColor: '#fff', elevation: 12 },
  icon: { alignSelf: 'flex-end', width: 54, height: 54, borderRadius: 16, backgroundColor: '#e8f8f0', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  check: { color: '#0f9475', fontSize: 30, fontWeight: '800' },
  title: { color: '#243c35', fontSize: 20, fontWeight: '800', textAlign: 'right' },
  message: { color: '#84958f', fontSize: 13, lineHeight: 24, textAlign: 'right', marginTop: 12 },
  destination: { padding: 15, marginVertical: 20, borderRadius: 12, backgroundColor: '#f3f8f5', gap: 7 },
  destinationLabel: { color: '#8ca297', fontSize: 11, textAlign: 'right' },
  destinationName: { color: '#33473f', fontSize: 16, fontWeight: '700', textAlign: 'right' },
  error: { color: '#b91c1c', textAlign: 'right', fontSize: 12, lineHeight: 22, marginBottom: 15 },
  actions: { flexDirection: 'row', gap: 10 },
  back: { flex: 1, paddingVertical: 14, borderRadius: 11, backgroundColor: '#f1f5f9', alignItems: 'center' },
  backText: { color: '#64748b', fontWeight: '700' },
  confirm: { flex: 2, paddingVertical: 14, borderRadius: 11, backgroundColor: '#0f9475', alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: .55 },
});
