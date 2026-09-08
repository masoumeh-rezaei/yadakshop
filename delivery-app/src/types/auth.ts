export type UserRole = 'ADMIN' | 'DRIVER';

export interface User {
  id: number;
  phone: string;
  fullName: string | null;
  role: UserRole;
}

export interface LoginResponse {
  success: true;
  data: { token: string; user: User };
}
