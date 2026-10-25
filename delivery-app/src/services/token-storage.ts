import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { User } from '@/types/auth';

const TOKEN_KEY = 'delivery_auth_token';
const USER_KEY = 'delivery_auth_user';

const getItem = (key: string) => {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
  return SecureStore.getItemAsync(key);
};

const setItem = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const removeItem = async (key: string) => {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export const tokenStorage = {
  get: () => getItem(TOKEN_KEY),
  getUser: async (): Promise<User | null> => {
    const value = await getItem(USER_KEY);
    if (!value) return null;
    try {
      return JSON.parse(value) as User;
    } catch {
      await removeItem(USER_KEY);
      return null;
    }
  },
  set: (token: string) => setItem(TOKEN_KEY, token),
  setUser: (user: User) => setItem(USER_KEY, JSON.stringify(user)),
  setSession: async (token: string, user: User) => {
    await Promise.all([setItem(TOKEN_KEY, token), setItem(USER_KEY, JSON.stringify(user))]);
  },
  remove: () => Promise.all([removeItem(TOKEN_KEY), removeItem(USER_KEY)]).then(() => undefined),
};
