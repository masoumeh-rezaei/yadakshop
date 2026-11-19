import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { PushStatus } from '@/services/push-state';

interface Props {
  status: PushStatus; checking: boolean; testing: boolean;
  message: string; testMessage: string; testError: boolean;
  onSettings: () => Promise<void>; onTest: () => Promise<void>;
}

export function TaskNotificationMenu({ status, checking, testing, message, testMessage, testError, onSettings, onTest }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  if (status === 'unsupported' && !checking) return null;
  const ready = status === 'ready';
  const needsAttention = !checking && !ready;
  const openSettings = async () => {
    setSettingsError('');
    try { await onSettings(); }
    catch { setSettingsError('تنظیمات باز نشد؛ از تنظیمات گوشی، اجازهٔ اعلان این برنامه را بررسی کنید.'); }
  };

  return <View style={styles.menu}>
    <Pressable accessibilityRole="button" accessibilityLabel="گزینه‌های اعلان گوشی" accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.bar, pressed && styles.pressed]}>
      <View style={styles.identity}>
        <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} size={18} tintColor="#0f766e" />
        <Text style={styles.title}>اعلان‌ها</Text>
      </View>
      <View style={styles.trailing}>
        <View style={[styles.badge, needsAttention && styles.warningBadge]}>
          {checking ? <ActivityIndicator size="small" color="#71857c" /> : <View style={[styles.dot, needsAttention && styles.warningDot]} />}
          <Text style={[styles.badgeText, needsAttention && styles.warningText]}>{checking ? 'در حال بررسی' : ready ? 'فعال' : 'نیاز به تنظیم'}</Text>
        </View>
        <SymbolView name={{ ios: expanded ? 'chevron.up' : 'chevron.down', android: expanded ? 'expand_less' : 'expand_more', web: expanded ? 'expand_less' : 'expand_more' }} size={17} tintColor="#84958f" />
      </View>
    </Pressable>
    {expanded && <View style={styles.content}>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="تنظیمات گوشی" onPress={() => { void openSettings(); }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={17} tintColor="#0f766e" />
          <Text style={styles.actionText}>تنظیمات گوشی</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="آزمایش نوار اعلان" disabled={testing || checking}
          accessibilityState={{ disabled: testing || checking, busy: testing }}
          onPress={() => { setSettingsError(''); void onTest(); }}
          style={({ pressed }) => [styles.action, styles.testAction, (testing || checking) && styles.disabled, pressed && styles.pressed]}>
          {testing ? <ActivityIndicator size="small" color="#0f766e" /> : <SymbolView name={{ ios: 'bell.badge', android: 'notifications_active', web: 'notifications_active' }} size={17} tintColor="#0f766e" />}
          <Text style={styles.actionText}>{testing ? 'در حال آزمایش…' : 'آزمایش نوار اعلان'}</Text>
        </Pressable>
      </View>
      {(needsAttention || testMessage || settingsError) ? <Text accessibilityLiveRegion="polite"
        style={[styles.feedback, (testError || settingsError || needsAttention) && styles.error]}>
        {settingsError || testMessage || message}
      </Text> : null}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  menu: { marginBottom: 13, borderWidth: 1, borderColor: '#e0ebe5', borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden' },
  bar: { minHeight: 46, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, flexShrink: 1 },
  title: { color: '#426153', fontSize: 12, fontWeight: '600' },
  trailing: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 1 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7, backgroundColor: '#f0f8f3' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#0f9475' },
  badgeText: { fontSize: 10, color: '#527b65', flexShrink: 1 },
  warningBadge: { backgroundColor: '#fff7e7' }, warningDot: { backgroundColor: '#c18a32' }, warningText: { color: '#a17533' },
  content: { borderTopWidth: 1, borderTopColor: '#edf3ef', padding: 10, gap: 9 },
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  action: { flex: 1, minWidth: 128, minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, backgroundColor: '#f4f7f5' },
  testAction: { backgroundColor: '#ecf8f1' },
  actionText: { color: '#0f766e', fontSize: 11, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  feedback: { color: '#648171', fontSize: 10, lineHeight: 19, textAlign: 'right', writingDirection: 'rtl' },
  error: { color: '#ae722a' },
  pressed: { opacity: .65 }, disabled: { opacity: .45 },
});
