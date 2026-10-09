import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { NativeModules, Platform } from 'react-native';
import { API_URL, ApiError, sendLocation } from '@/services/api';
import { tokenStorage } from '@/services/token-storage';

export const BACKGROUND_LOCATION_TASK = 'delivery-driver-background-location';

interface BackgroundLocationData {
  locations: Location.LocationObject[];
}

if (Platform.OS !== 'android' && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  // Task باید بیرون از کامپوننت React تعریف شود تا سیستم‌عامل در پس‌زمینه هم آن را اجرا کند.
  TaskManager.defineTask<BackgroundLocationData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;

    const token = await tokenStorage.get();
    if (!token) {
      // بدون نشست معتبر، ردیابی متوقف می‌شود تا موقعیت ناشناس ارسال نشود.
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
      return;
    }

    for (const location of data.locations) {
      try {
        await sendLocation(token, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          recordedAt: new Date(location.timestamp).toISOString(),
        });
      } catch (sendError) {
        if (sendError instanceof ApiError && sendError.status === 401) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
          return;
        }
        console.warn('Background location upload failed', sendError);
      }
    }
  });
}

export interface NativeTrackingStatus {
  active: boolean;
  serviceRunning: boolean;
  queuedLocations: number;
  lastFixAt: number;
  lastUploadAt: number;
}

interface DeliveryTrackingNativeModule {
  start(token: string, apiUrl: string): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<NativeTrackingStatus>;
}

const nativeTracking = NativeModules.DeliveryTracking as DeliveryTrackingNativeModule | undefined;

const stopLegacyAndroidTask = async () => {
  if (Platform.OS !== 'android') return;
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
  }
};

export const getTrackingStatus = async (): Promise<NativeTrackingStatus> => {
  if (Platform.OS === 'android') {
    if (!nativeTracking) throw new Error('ماژول ردیابی Android در این نسخه نصب نشده است؛ APK را دوباره بسازید.');
    await stopLegacyAndroidTask();
    return nativeTracking.getStatus();
  }
  const active = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  return { active, serviceRunning: active, queuedLocations: 0, lastFixAt: 0, lastUploadAt: 0 };
};

export const isBackgroundTrackingActive = async () => (await getTrackingStatus()).active;

interface AppExitInfoNativeModule {
  consumeUserRequestedStop(): Promise<boolean>;
}

const appExitInfo = NativeModules.AppExitInfo as AppExitInfoNativeModule | undefined;

/**
 * Android does not invoke an app callback when the user presses Stop in the
 * system's Active apps panel. The OS kills the process, but Expo's persisted
 * TaskManager registration can remain. On the next launch, consume that exit
 * reason once and unregister the stale location task.
 */
export const reconcileUserRequestedStop = async () => {
  if (Platform.OS !== 'android' || !appExitInfo) return false;

  const wasStoppedByUser = await appExitInfo.consumeUserRequestedStop();
  if (wasStoppedByUser) {
    await stopBackgroundTracking();
  }
  return wasStoppedByUser;
};

export const startBackgroundTracking = (token: string) => {
  if (Platform.OS === 'android') {
    if (!nativeTracking) return Promise.reject(new Error('ماژول ردیابی Android در دسترس نیست؛ APK را دوباره بسازید.'));
    return stopLegacyAndroidTask().then(() => nativeTracking.start(token, API_URL));
  }
  return Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000,
    distanceInterval: 15,
    // ترکیب بازه زمانی و فاصله، مصرف باتری و تازگی موقعیت را متعادل می‌کند.
    // Do not defer delivery: delayed batches make live tracking appear stale.
    foregroundService: {
      notificationTitle: 'سامانه پیک فعال است',
      notificationBody: 'موقعیت شما برای مرکز مدیریت ارسال می‌شود.',
      notificationColor: '#2563eb',
      // Keep the Android foreground service alive when the user removes the app
      // from the recent-apps screen. Android still stops every service after an
      // explicit Force stop from system settings.
      killServiceOnDestroy: false,
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
};

export const stopBackgroundTracking = async () => {
  if (Platform.OS === 'android') {
    await nativeTracking?.stop();
    return;
  }
  if (await isBackgroundTrackingActive()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
};
