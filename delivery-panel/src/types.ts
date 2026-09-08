export type UserRole = 'ADMIN' | 'DRIVER';

export interface User {
  id: number;
  phone: string;
  fullName: string | null;
  role: UserRole;
  isActive?: number | boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DriverLocation {
  id: number;
  userId: number;
  phone: string;
  fullName: string | null;
  latitude: number | string;
  longitude: number | string;
  accuracy: number | string | null;
  recordedAt: string;
}

export interface LoginResult {
  token: string;
  user: User;
}
