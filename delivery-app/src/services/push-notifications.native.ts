import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { registerPushDevice, removePushDevice } from './api';
import { tokenStorage } from './token-storage';

export type PushStatus = 'ready' | 'permission' | 'unavailable' | 'error' | 'unsupported';
let registeredToken: string | null = null;
let registrationGeneration = 0;
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerTaskNotifications(token: string, requestPermission = false): Promise<PushStatus> {
  const generation = registrationGeneration;
  if (Constants.executionEnvironment === 'storeClient') return 'unavailable';
  if (Platform.OS === 'android' && !Constants.expoConfig?.extra?.notificationsConfigured) return 'unavailable';
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('tasks', {
      name: 'وظایف جدید', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250], lightColor: '#0f766e', sound: 'default',
    });
    let permission = await Notifications.getPermissionsAsync();
    const allowed = () => permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed() && requestPermission && !permission.canAskAgain) { await Linking.openSettings(); return 'permission'; }
    if (!allowed() && requestPermission) permission = await Notifications.requestPermissionsAsync();
    if (!allowed()) return 'permission';
    const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return 'unavailable';
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    if (generation !== registrationGeneration) return 'error';
    await registerPushDevice(token, result.data, Platform.OS === 'ios' ? 'ios' : 'android');
    if (generation !== registrationGeneration) { await removePushDevice(token, result.data); return 'error'; }
    registeredToken = result.data;
    await tokenStorage.setPushToken(result.data);
    return 'ready';
  } catch { return 'error'; }
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
  const tokenListener = Notifications.addPushTokenListener(() => { if (active) tokenChanged?.(); });
  void Notifications.getLastNotificationResponseAsync().then(value => { if (active && value) onResponse(value); }).catch(() => {});
  return () => { active = false; received.remove(); response.remove(); tokenListener.remove(); };
}
