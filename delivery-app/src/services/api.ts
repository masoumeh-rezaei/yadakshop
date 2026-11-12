import { Platform } from 'react-native';
import type { LoginResponse, User } from '@/types/auth';
import type { DriverTask } from '@/types/task';
import { taskMapUrl } from '@/utils/task-map-url';

const fallbackUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || fallbackUrl).replace(/\/$/, '');
export const TASK_MAP_URL = taskMapUrl(API_URL, __DEV__, process.env.EXPO_PUBLIC_MAP_URL);

interface ApiErrorBody { message?: string }

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

const fetchWithTimeout = async (input: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => null) as ApiErrorBody | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body && body.message
      ? body.message
      : 'ارتباط با سرور ناموفق بود';
    throw new ApiError(message, response.status);
  }
  return body as T;
};

export const loginRequest = async (phone: string, password: string) => {
  const response = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  return parseResponse<LoginResponse>(response);
};

export const getCurrentUser = async (token: string): Promise<User> => {
  const response = await fetchWithTimeout(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await parseResponse<{ success: true; data: User }>(response);
  return body.data;
};

export interface LocationPayload {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
}

export const sendLocation = async (token: string, location: LocationPayload) => {
  const response = await fetchWithTimeout(`${API_URL}/api/locations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(location),
  });
  return parseResponse<{ success: true; data: { id: number; recordedAt: string } }>(response);
};

export const getMyTasks = async (token: string, signal?: AbortSignal): Promise<DriverTask[]> => {
  const response = await fetch(`${API_URL}/api/tasks/mine`, { headers: { Authorization: `Bearer ${token}` }, signal });
  return (await parseResponse<{ success: true; data: DriverTask[] }>(response)).data;
};

export const completeMyTask = async (token: string, task: DriverTask, signal?: AbortSignal): Promise<DriverTask> => {
  const response = await fetch(`${API_URL}/api/tasks/${task.id}/complete`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: task.revision }), signal,
  });
  return (await parseResponse<{ success: true; data: DriverTask }>(response)).data;
};

export const registerPushDevice = async (token: string, expoPushToken: string, platform: 'android' | 'ios') => {
  const response = await fetchWithTimeout(`${API_URL}/api/notifications/device`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expoPushToken, platform }),
  });
  await parseResponse(response);
};
export const removePushDevice = async (token: string, expoPushToken: string) => {
  const response = await fetch(`${API_URL}/api/notifications/device`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expoPushToken }), signal: AbortSignal.timeout(3000),
  });
  await parseResponse(response);
};
