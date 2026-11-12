export type UserRole = 'ADMIN' | 'DRIVER';

export interface User {
  id: number;
  phone: string;
  fullName: string | null;
  role: UserRole;
  isActive?: number | boolean;
  hasLocationHistory?: number | boolean;
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

export interface HistoryDay {
  /** Gregorian day key in Asia/Tehran; displayed with the Persian calendar. */
  date: string;
}

export interface SavedPlace {
  id: number;
  name: string;
  latitude: number | string;
  longitude: number | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResult {
  token: string;
  user: User;
}

export interface DriverTask {
  id: number;
  driverId: number;
  driverName: string | null;
  driverPhone: string;
  placeId: number;
  placeName: string;
  latitude: number | string;
  longitude: number | string;
  status: 'pending' | 'completed' | 'cancelled';
  revision: number;
  assignedAt: string;
  completedAt: string | null;
  updatedAt: string;
}
