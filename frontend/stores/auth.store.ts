'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { syncCapabilityCookies } from '@/lib/auth/session';
import type { AuthTokens, AuthUser, Capabilities } from '@/lib/api/types';
import { EMPTY_CAPABILITIES } from '@/lib/api/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  user: AuthUser | null;
  capabilities: Capabilities;
  capabilitiesReady: boolean;
  setAuth: (tokens: AuthTokens) => void;
  /** Updates tokens after refresh without clearing loaded capabilities. */
  updateSessionTokens: (tokens: AuthTokens) => void;
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
      capabilitiesReady: false,
      setAuth: (tokens: AuthTokens) => {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          sessionId: tokens.sessionId,
          user: tokens.user,
          capabilities: initialCapabilities,
          capabilitiesReady: false,
        });
      },
      updateSessionTokens: (tokens: AuthTokens) => {
        set((state) => ({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          sessionId: tokens.sessionId,
          user: tokens.user,
          capabilities: state.capabilities,
          capabilitiesReady: state.capabilitiesReady,
        }));
      },
      updateUser: (partial: Partial<AuthUser>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        }));
      },
      setCapabilities: (capabilities: Capabilities) => {
        const normalized = {
          ...capabilities,
          canViewNotifications: true,
        };
        syncCapabilityCookies({
          pmModuleEnabled: normalized.modulesProjectManagementEnabled,
          isSystemAdministrator: normalized.isSystemAdministrator,
        });
        set({
          capabilities: normalized,
          capabilitiesReady: true,
        });
      },
      clearAuth: () => {
        set({
          accessToken: null,
          refreshToken: null,
          sessionId: null,
          user: null,
          capabilities: initialCapabilities,
          capabilitiesReady: false,
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
      }),
    },
  ),
);
