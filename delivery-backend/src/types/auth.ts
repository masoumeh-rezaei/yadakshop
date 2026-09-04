export type UserRole = 'ADMIN' | 'DRIVER';

export interface AuthUser {
  id: number;
  phone: string;
  fullName: string | null;
  role: UserRole;
}

export interface TokenPayload {
  sub: string;
  phone: string;
  role: UserRole;
}
