'use client';

import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import { clearAuthCookie } from '@/lib/auth/session';
import { fetchCapabilities } from '@/lib/permissions/capabilities';
import { useAuthStore } from '@/stores/auth.store';
import type { AuthTokens, LoginRequest, MessageResponse } from '@/lib/api/types';

export function useLogin() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const setCapabilities = useAuthStore((state) => state.setCapabilities);

  return useMutation({
    mutationFn: async (credentials: LoginRequest): Promise<AuthTokens> => {
      return apiPost<AuthTokens>('/auth/login', {
        ...credentials,
        deviceInfo:
          credentials.deviceInfo ??
          (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      });
    },
    onSuccess: async (tokens) => {
      setAuth(tokens);
      const capabilities = await fetchCapabilities();
      setCapabilities(capabilities);
    },
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((state) => state.clearAuth);

  return useMutation({
    mutationFn: async (): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/logout');
    },
    onSettled: () => {
      clearAuthCookie();
      clearAuth();
    },
  });
}
