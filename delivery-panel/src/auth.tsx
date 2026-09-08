import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api';
import type { User } from './types';

const TOKEN_KEY = 'delivery_admin_token';

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setLoading(false);
      return;
    }
    api.me(savedToken)
      .then((currentUser) => {
        if (currentUser.role !== 'ADMIN') throw new ApiError('این حساب دسترسی مدیریت ندارد.', 403);
        setToken(savedToken);
        setUser(currentUser);
      })
      .catch(() => sessionStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone: string, password: string) => {
    const result = await api.login(phone, password);
    if (result.user.role !== 'ADMIN') throw new ApiError('این پنل فقط برای مدیر سیستم است.', 403);
    sessionStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
  };

  const value = useMemo(() => ({ token, user, loading, login, logout }), [token, user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
};
