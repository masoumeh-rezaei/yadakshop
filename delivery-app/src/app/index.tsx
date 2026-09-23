import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { API_URL } from '@/services/api';
import {
  isBackgroundTrackingActive,
  reconcileUserRequestedStop,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '@/tasks/background-location';

export default function HomeScreen() {
  const { user, token, isLoading, login, logout } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [locationStatus, setLocationStatus] = useState('موقعیت مکانی هنوز فعال نشده است.');
  const [lastLocation, setLastLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    if (user?.role !== 'DRIVER') return;
    let mounted = true;
    Promise.all([
      reconcileUserRequestedStop().then(async (wasStoppedByUser) => ({
        active: await isBackgroundTrackingActive(),
        wasStoppedByUser,
      })),
      Location.getLastKnownPositionAsync(),
    ]).then(([trackingState, location]) => {
      if (!mounted) return;
      setIsTracking(trackingState.active);
      setLastLocation(location);
      if (trackingState.wasStoppedByUser) {
        setLocationStatus('ارسال موقعیت با توقف برنامه از پنل گوشی متوقف شده است.');
      } else if (trackingState.active) {
        setLocationStatus('ارسال موقعیت در پس‌زمینه فعال است.');
      }
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [user?.id, user?.role]);

  const stopTracking = async () => {
    setTrackingBusy(true);
    try {
      await stopBackgroundTracking();
      setIsTracking(false);
      setLocationStatus('ارسال موقعیت متوقف شده است.');
    } catch (trackingError) {
      setLocationStatus(trackingError instanceof Error ? trackingError.message : 'توقف ردیابی ناموفق بود.');
    } finally {
      setTrackingBusy(false);
    }
  };

  const startTracking = async () => {
    if (!token || isTracking) return;
    setTrackingBusy(true);
    setLocationStatus('در حال بررسی سرویس و مجوزهای موقعیت...');
    try {
      if (!(await TaskManager.isAvailableAsync())) {
        setLocationStatus('ردیابی پس‌زمینه در Expo Go فعال نیست؛ Development Build یا APK نصب کنید.');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocationStatus('GPS گوشی خاموش است؛ ابتدا Location را روشن کنید.');
        return;
      }

      const foregroundPermission = await Location.requestForegroundPermissionsAsync();
      if (foregroundPermission.status !== Location.PermissionStatus.GRANTED) {
        setLocationStatus('مجوز موقعیت هنگام استفاده داده نشد. آن را از تنظیمات گوشی فعال کنید.');
        return;
      }

      const currentBackgroundPermission = await Location.getBackgroundPermissionsAsync();
      if (currentBackgroundPermission.status !== Location.PermissionStatus.GRANTED) {
        setLocationStatus('برای ادامه، دسترسی موقعیت همیشگی را تأیید کنید.');
        const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
        if (backgroundPermission.status !== Location.PermissionStatus.GRANTED) {
          setLocationStatus('مجوز پس‌زمینه داده نشد. در تنظیمات Location گزینه «Allow all the time» را انتخاب کنید.');
          return;
        }
        setLocationStatus('مجوز ثبت شد. پس از بازگشت کامل به برنامه، دوباره دکمه فعال‌سازی را بزنید.');
        return;
      }

      if (AppState.currentState !== 'active') {
        setLocationStatus('برای شروع سرویس، برنامه باید روی صفحه و فعال باشد.');
        return;
      }

      await startBackgroundTracking();
      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLastLocation(currentLocation);
      setIsTracking(true);
      setLocationStatus('ارسال موقعیت فعال است و در پس‌زمینه نیز ادامه پیدا می‌کند.');
    } catch (trackingError) {
      setLocationStatus(trackingError instanceof Error ? trackingError.message : 'فعال‌سازی ردیابی ناموفق بود.');
    } finally {
      setTrackingBusy(false);
    }
  };

  const handleLogout = async () => {
    await stopBackgroundTracking().catch(() => undefined);
    setIsTracking(false);
    await logout();
  };

  const handleLogin = async () => {
    const normalizedPhone = phone.trim().replace(/[۰-۹]/g, (digit) =>
      String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
    );
    if (!normalizedPhone || !password) {
      setError('شماره موبایل و رمز عبور را وارد کنید.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(normalizedPhone, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'ورود ناموفق بود.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (user) {
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.dashboardContent}>
          <View style={styles.dashboardCard}>
            <View style={[styles.statusDot, !isTracking && styles.statusDotInactive]} />
            <Text style={styles.welcome}>خوش آمدید</Text>
            <Text style={styles.name}>{user.fullName || user.phone}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{user.role === 'ADMIN' ? 'مدیر' : 'پیک'}</Text>
              <Text style={styles.infoLabel}>نقش</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{user.phone}</Text>
              <Text style={styles.infoLabel}>شماره موبایل</Text>
            </View>

            {user.role === 'DRIVER' && (
              <View style={styles.trackingBox}>
                <Text style={styles.trackingTitle}>{isTracking ? 'ردیابی پس‌زمینه فعال' : 'ردیابی غیرفعال'}</Text>
                <Text style={styles.disclosure}>
                  با فعال‌سازی، موقعیت شما حتی وقتی برنامه روی صفحه نیست برای مرکز مدیریت ارسال می‌شود.
                </Text>
                <Text style={styles.locationStatus}>{locationStatus}</Text>
                {lastLocation && (
                  <View style={styles.coordinates}>
                    <Text style={styles.coordinateText}>عرض: {lastLocation.coords.latitude.toFixed(6)}</Text>
                    <Text style={styles.coordinateText}>طول: {lastLocation.coords.longitude.toFixed(6)}</Text>
                    <Text style={styles.accuracyText}>دقت: {Math.round(lastLocation.coords.accuracy ?? 0)} متر</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.trackingButton, isTracking && styles.stopButton, trackingBusy && styles.buttonDisabled]}
                  onPress={isTracking ? stopTracking : startTracking}
                  disabled={trackingBusy}>
                  {trackingBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.trackingButtonText}>{isTracking ? 'توقف ارسال موقعیت' : 'فعال‌سازی ردیابی پس‌زمینه'}</Text>}
                </TouchableOpacity>
              </View>
            )}
            {user.role === 'ADMIN' && <Text style={styles.nextStep}>پنل مدیریتی در نسخه وب ساخته خواهد شد.</Text>}
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutText}>خروج از حساب</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>سامانه مدیریت ارسال</Text>
          <Text style={styles.title}>ورود به حساب</Text>
          <Text style={styles.subtitle}>برای شروع فعالیت، اطلاعات حساب خود را وارد کنید.</Text>
          <Text style={styles.label}>شماره موبایل</Text>
          <TextInput style={styles.input} placeholder="09123456789" placeholderTextColor="#94a3b8" value={phone}
            onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textAlign="right" editable={!submitting} />
          <Text style={styles.label}>رمز عبور</Text>
          <TextInput style={styles.input} placeholder="رمز عبور" placeholderTextColor="#94a3b8" value={password}
            onChangeText={setPassword} secureTextEntry textAlign="right" editable={!submitting} onSubmitEditing={handleLogin} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleLogin} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>ورود</Text>}
          </TouchableOpacity>
          {__DEV__ && <Text style={styles.devHint}>API: {API_URL}</Text>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 24, elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 20 },
  eyebrow: { color: '#2563eb', textAlign: 'center', fontWeight: '700', marginBottom: 10 },
  title: { color: '#0f172a', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#64748b', fontSize: 14, lineHeight: 23, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700', textAlign: 'right', marginBottom: 8 },
  input: { height: 52, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, marginBottom: 18, backgroundColor: '#f8fafc', color: '#0f172a' },
  error: { color: '#dc2626', textAlign: 'right', lineHeight: 21, marginBottom: 12 },
  button: { height: 52, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  devHint: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 16 },
  dashboardContent: { padding: 20, paddingTop: 70 },
  dashboardCard: { padding: 26, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', elevation: 4 },
  statusDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', marginBottom: 16 },
  statusDotInactive: { backgroundColor: '#94a3b8' },
  welcome: { color: '#64748b', fontSize: 15 },
  name: { color: '#0f172a', fontSize: 25, fontWeight: '800', marginTop: 5, marginBottom: 26 },
  infoRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 14 },
  infoLabel: { color: '#64748b' },
  infoValue: { color: '#0f172a', fontWeight: '700' },
  nextStep: { color: '#475569', textAlign: 'center', lineHeight: 23, marginVertical: 24 },
  trackingBox: { width: '100%', backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, marginVertical: 22 },
  trackingTitle: { color: '#1e3a8a', fontSize: 17, fontWeight: '800', textAlign: 'right' },
  disclosure: { color: '#334155', fontSize: 13, lineHeight: 21, textAlign: 'right', marginTop: 10 },
  locationStatus: { color: '#475569', lineHeight: 21, textAlign: 'right', marginTop: 10 },
  coordinates: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 12 },
  coordinateText: { color: '#0f172a', textAlign: 'right', fontVariant: ['tabular-nums'], marginBottom: 4 },
  accuracyText: { color: '#64748b', textAlign: 'right', marginTop: 3 },
  trackingButton: { height: 48, borderRadius: 11, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  stopButton: { backgroundColor: '#ea580c' },
  trackingButtonText: { color: '#fff', fontWeight: '800' },
  logoutButton: { width: '100%', height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '800' },
});
