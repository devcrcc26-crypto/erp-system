'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, AuthUser, Capabilities } from '@/lib/api/types';
import { EMPTY_CAPABILITIES } from '@/lib/api/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  user: AuthUser | null;
  capabilities: Capabilities;
  setAuth: (tokens: AuthTokens) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  setCapabilities: (capabilities: Capabilities) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const AUTH_PERSIST_KEY = 'erp-auth';

const initialCapabilities: Capabilities = { ...EMPTY_CAPABILITIES };

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      user: null,
      capabilities: initialCapabilities,
      setAuth: (tokens: AuthTokens) => {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          sessionId: tokens.sessionId,
          user: tokens.user,
        });
      },
      updateUser: (partial: Partial<AuthUser>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        }));
      },
      setCapabilities: (capabilities: Capabilities) => {
        set({ capabilities });
      },
      clearAuth: () => {
        set({
          accessToken: null,
          refreshToken: null,
          sessionId: null,
          user: null,
          capabilities: initialCapabilities,
        });
      },
      isAuthenticated: () => Boolean(get().accessToken),
    }),
    {
      name: AUTH_PERSIST_KEY,
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        sessionId: state.sessionId,
        user: state.user,
        capabilities: state.capabilities,
      }),
    },
  ),
);
