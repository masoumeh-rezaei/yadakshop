import { Platform } from 'react-native';
import type { LoginResponse, User } from '@/types/auth';

const fallbackUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || fallbackUrl).replace(/\/$/, '');

interface ApiErrorBody { message?: string }

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

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
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  return parseResponse<LoginResponse>(response);
};

export const getCurrentUser = async (token: string): Promise<User> => {
  const response = await fetch(`${API_URL}/api/auth/me`, {
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
  const response = await fetch(`${API_URL}/api/locations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(location),
  });
  return parseResponse<{ success: true; data: { id: number; recordedAt: string } }>(response);
};
