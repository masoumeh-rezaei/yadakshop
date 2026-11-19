import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { registerPushDevice, removePushDevice, testPushDevice, ApiError } from './api';
import { tokenStorage } from './token-storage';
import { pushOperation, pushFailure, type PushResult, type PushStage } from './push-state';

export type { PushStatus, PushResult } from './push-state';
let registeredToken: string | null = null;
let registrationGeneration = 0;
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerTaskNotifications(token: string, requestPermission = false, signal?: AbortSignal): Promise<PushResult> {
  const generation = registrationGeneration;
  if (Constants.executionEnvironment === 'storeClient') return { status: 'unavailable', stage: 'build', message: 'برای اعلان گوشی، APK مستقل را نصب کنید؛ Expo Go پشتیبانی نمی‌شود.' };
  if (Platform.OS === 'android' && !Constants.expoConfig?.extra?.notificationsConfigured) return { status: 'unavailable', stage: 'build', message: 'این APK تنظیمات Firebase ندارد؛ آخرین نسخهٔ اپ را نصب کنید.' };
  let stage: PushStage = 'channel';
  try {
    const run = <T>(operation: () => Promise<T>, next: PushStage, milliseconds = 10_000) => {
      stage = next; return pushOperation(operation, next, milliseconds, signal);
    };
    if (Platform.OS === 'android') await run(() => Notifications.setNotificationChannelAsync('tasks', {
      name: 'وظایف جدید', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250], lightColor: '#0f766e', sound: 'default', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }), 'channel');
    let permission = await run(() => Notifications.getPermissionsAsync(), 'permission');
    const allowed = () => permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed() && requestPermission && !permission.canAskAgain) {
      await openTaskNotificationSettings();
      return { status: 'permission', stage: 'permission', message: 'در تنظیمات گوشی، اجازهٔ اعلان اپ را روشن کنید؛ بعد به برنامه برگردید.' };
    }
    if (!allowed() && requestPermission) permission = await run(() => Notifications.requestPermissionsAsync(), 'permission', 60_000);
    if (!allowed()) return { status: 'permission', stage: 'permission', message: 'اجازهٔ اعلان داده نشده است؛ از «تنظیمات گوشی» آن را روشن کنید.' };
    if (Platform.OS === 'android') {
      const channel = await run(() => Notifications.getNotificationChannelAsync('tasks'), 'channel');
      if (!channel || channel.importance === Notifications.AndroidImportance.NONE) {
        if (requestPermission) await openTaskNotificationSettings();
        return { status: 'permission', stage: 'channel', message: 'دستهٔ «وظایف جدید» در تنظیمات اعلان گوشی خاموش است؛ آن را روشن کنید.' };
      }
    }
    const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return { status: 'unavailable', stage: 'build', message: 'شناسهٔ پروژهٔ Expo در این نسخه تنظیم نشده؛ نسخهٔ جدید را نصب کنید.' };
    // Re-register an existing token without needing a second network trip to Expo on every resume.
    const cached = registeredToken || await tokenStorage.getPushToken().catch(() => null);
    let pushToken = cached;
    if (!pushToken) {
      const devicePushToken = await run(() => Notifications.getDevicePushTokenAsync(), 'device-token', 20_000);
      const result = await run(() => Notifications.getExpoPushTokenAsync({ projectId, devicePushToken }), 'expo-token', 20_000);
      pushToken = result.data;
    }
    if (generation !== registrationGeneration || signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    await run(() => registerPushDevice(token, pushToken!, Platform.OS === 'ios' ? 'ios' : 'android', signal), 'server', 17_000);
    if (generation !== registrationGeneration) { await removePushDevice(token, pushToken); throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); }
    registeredToken = pushToken;
    await tokenStorage.setPushToken(pushToken);
    return { status: 'ready', stage: 'server', message: 'این گوشی برای دریافت اعلان وظایف روی سرور ثبت شد.' };
  } catch (cause) {
    if ((cause as Error)?.name === 'AbortError') throw cause;
    return pushFailure(cause, stage);
  }
}

export async function openTaskNotificationSettings() {
  if (Platform.OS === 'android') {
    try { await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [{ key: 'android.provider.extra.APP_PACKAGE', value: Constants.expoConfig?.android?.package || 'com.yadakshop.deliveryapp' }]); return; } catch {}
  }
  await Linking.openSettings();
}

export async function testLocalTaskNotification(): Promise<PushResult> {
  try {
    const permission = await pushOperation(() => Notifications.getPermissionsAsync(), 'permission', 10_000);
    if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return { status: 'permission', stage: 'permission', message: 'ابتدا اجازهٔ اعلان گوشی را فعال کنید.' };
    if (Platform.OS === 'android') {
      const channel = await pushOperation(() => Notifications.getNotificationChannelAsync('tasks'), 'channel', 10_000);
      if (!channel || channel.importance === Notifications.AndroidImportance.NONE) return { status: 'permission', stage: 'channel', message: 'در تنظیمات گوشی، دستهٔ اعلان «وظایف جدید» را روشن کنید.' };
    }
    await pushOperation(() => Notifications.scheduleNotificationAsync({ content: {
      title: 'آزمایش اعلان گوشی', body: 'این پیام آزمایشی است؛ باید در نوار اعلان گوشی دیده شود.',
      sound: 'default', data: { type: 'push.local-test' },
    }, trigger: Platform.OS === 'android' ? { channelId: 'tasks' } : null }), 'local-test', 10_000);
    return { status: 'ready', stage: 'local-test', message: 'اعلان محلی درخواست شد؛ نوار اعلان گوشی را بررسی کنید. این آزمایش اتصال سرور را بررسی نمی‌کند.' };
  } catch (cause) { return pushFailure(cause, 'local-test'); }
}

export async function testRemoteTaskNotification(token: string): Promise<PushResult> {
  const pushToken = registeredToken || await tokenStorage.getPushToken().catch(() => null);
  if (!pushToken) return { status: 'error', stage: 'remote-test', message: 'ابتدا فعال‌سازی اعلان‌ها را کامل کنید.' };
  try {
    await testPushDevice(token, pushToken);
    return { status: 'ready', stage: 'remote-test', message: 'سرویس ارسال، پیام آزمایشی را پذیرفت؛ دریافت را در نوار اعلان گوشی بررسی کنید. پذیرش سرویس به‌تنهایی تأیید دریافت نیست.' };
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      registeredToken = null; await tokenStorage.removePushToken().catch(() => {});
    }
    if (cause instanceof ApiError) return { status: 'error', stage: 'remote-test', message: cause.message };
    return { status: 'error', stage: 'remote-test', message: 'آزمایش ارسال از سرور ناموفق بود؛ اتصال اینترنت را بررسی کنید.' };
  }
}

export async function unregisterTaskNotifications(token: string) {
  registrationGeneration += 1;
  const previous = registeredToken || await tokenStorage.getPushToken().catch(() => null);
  registeredToken = null;
  if (previous) {
    try { await removePushDevice(token, previous); await tokenStorage.removePushToken(); } catch { /* Offline logout must still remove the local session. */ }
  }
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}

export function subscribeTaskNotifications(refresh: () => void, select: (taskId: number) => void, tokenChanged?: () => void) {
  const onResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (data?.type === 'task.assigned' && Number.isSafeInteger(data.taskId) && Number(data.taskId) > 0) {
      refresh(); select(Number(data.taskId));
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
  };
  const received = Notifications.addNotificationReceivedListener(() => refresh());
  const response = Notifications.addNotificationResponseReceivedListener(onResponse);
  let active = true;
  const tokenListener = Notifications.addPushTokenListener(() => {
    registeredToken = null;
    void tokenStorage.removePushToken().catch(() => {}).then(() => { if (active) tokenChanged?.(); });
  });
  void Notifications.getLastNotificationResponseAsync().then(value => { if (active && value) onResponse(value); }).catch(() => {});
  return () => { active = false; received.remove(); response.remove(); tokenListener.remove(); };
}
