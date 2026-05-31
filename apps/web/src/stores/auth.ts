import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResponse, AuthUser } from '../lib/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (resp: AuthResponse) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (resp) =>
        set({ accessToken: resp.accessToken, refreshToken: resp.refreshToken, user: resp.user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'mindline-auth' },
  ),
);
