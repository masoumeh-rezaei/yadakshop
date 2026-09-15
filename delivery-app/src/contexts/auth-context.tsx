import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, getCurrentUser, loginRequest } from '@/services/api';
import { tokenStorage } from '@/services/token-storage';
import type { User } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await tokenStorage.remove();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    // در شروع برنامه، توکن ذخیره‌شده با سرور اعتبارسنجی می‌شود؛ وجود محلی آن به‌تنهایی کافی نیست.
    tokenStorage.get()
      .then(async (storedToken) => {
        if (!storedToken) return;
        const currentUser = await getCurrentUser(storedToken);
        if (mounted) {
          setToken(storedToken);
          setUser(currentUser);
        }
      })
      .catch(async () => tokenStorage.remove())
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    try {
      const response = await loginRequest(phone, password);
      await tokenStorage.set(response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('سرور در دسترس نیست؛ آدرس API و اتصال شبکه را بررسی کنید');
    }
  }, []);

  const value = useMemo(() => ({ user, token, isLoading, login, logout }), [user, token, isLoading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
