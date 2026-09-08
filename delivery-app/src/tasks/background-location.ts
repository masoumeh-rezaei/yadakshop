import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, sendLocation } from '@/services/api';
import { tokenStorage } from '@/services/token-storage';

export const BACKGROUND_LOCATION_TASK = 'delivery-driver-background-location';

interface BackgroundLocationData {
  locations: Location.LocationObject[];
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<BackgroundLocationData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;

    const token = await tokenStorage.get();
    if (!token) {
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

export const isBackgroundTrackingActive = () =>
  Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

export const startBackgroundTracking = () =>
  Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000,
    distanceInterval: 15,
    deferredUpdatesInterval: 15_000,
    deferredUpdatesDistance: 15,
    foregroundService: {
      notificationTitle: 'سامانه پیک فعال است',
      notificationBody: 'موقعیت شما برای مرکز مدیریت ارسال می‌شود.',
      notificationColor: '#2563eb',
      killServiceOnDestroy: true,
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });

export const stopBackgroundTracking = async () => {
  if (await isBackgroundTrackingActive()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
};
