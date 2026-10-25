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
    // نشست ذخیره‌شده فوراً بازیابی و سپس در پس‌زمینه با سرور اعتبارسنجی می‌شود.
    const restoreSession = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          tokenStorage.get(),
          tokenStorage.getUser(),
        ]);
        if (!storedToken) return;

        // Restore the last verified identity immediately. A temporary network
        // outage must not turn into a logout or block the app at startup.
        if (mounted) {
          setToken(storedToken);
          setUser(storedUser);
          if (storedUser) setIsLoading(false);
        }

        try {
          const currentUser = await getCurrentUser(storedToken);
          await tokenStorage.setUser(currentUser);
          if (mounted) setUser(currentUser);
        } catch (error) {
          // Only a definitive authentication rejection invalidates the local
          // session. Timeouts, offline starts and server errors keep it intact.
          if (error instanceof ApiError && error.status === 401) {
            await tokenStorage.remove();
            if (mounted) {
              setToken(null);
              setUser(null);
            }
          }
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    restoreSession().catch(() => {
      if (mounted) setIsLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    try {
      const response = await loginRequest(phone, password);
      await tokenStorage.setSession(response.data.token, response.data.user);
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
