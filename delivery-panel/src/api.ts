import type { DriverLocation, LoginResult, User, UserRole } from './types';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const request = async <T>(path: string, options: RequestInit = {}, token?: string): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null) as { message?: string; data?: T } | null;
  if (!response.ok) throw new ApiError(body?.message || 'ارتباط با سرور ناموفق بود.', response.status);
  return body?.data as T;
};

export const api = {
  login: (phone: string, password: string) => request<LoginResult>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ phone, password }),
  }),
  me: (token: string) => request<User>('/api/auth/me', {}, token),
  users: (token: string) => request<User[]>('/api/users', {}, token),
  latestLocations: (token: string) => request<DriverLocation[]>('/api/locations/latest', {}, token),
  createUser: (token: string, input: { phone: string; password: string; fullName: string; role: UserRole }) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify(input) }, token),
  setUserStatus: (token: string, id: number, isActive: boolean) =>
    request<{ id: number; isActive: boolean }>(`/api/users/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ isActive }),
    }, token),
};
