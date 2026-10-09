import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, onUnauthorized, setToken } from '../lib/api';
import type { User } from '../lib/types';

/** Body of PUT /api/auth/me/tour: chapters to mark done, or finish / skip / reset the guided tour. */
export interface TourUpdate {
  done?: string[];
  finished?: true;
  skipped?: true;
  reset?: true;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  /** Saves guided-tour progress and refreshes `user.tour`. */
  saveTour: (update: TourUpdate) => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onUnauthorized(() => {
      setToken(null);
      setUser(null);
    });
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const r = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password, remember });
    setToken(r.token, remember);
    setUser(r.user);
  }, []);

  const register = useCallback(async (data: { name: string; email: string; password: string; phone?: string }) => {
    const r = await api.post<{ token: string; user: User }>('/api/auth/register', data);
    setToken(r.token, false);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ignore – token is cleared locally anyway */
    }
    setToken(null);
    setUser(null);
  }, []);

  const saveTour = useCallback(async (update: TourUpdate) => {
    const r = await api.put<{ user: User }>('/api/auth/me/tour', update);
    // Ignore the answer if the user logged out meanwhile.
    setUser((cur) => (cur && r.user && cur.id === r.user.id ? r.user : cur));
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, setUser, saveTour }), [user, loading, login, register, logout, saveTour]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
