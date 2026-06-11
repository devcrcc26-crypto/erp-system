'use client';

import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import { clearAuthCookie } from '@/lib/auth/session';
import { fetchCapabilities } from '@/lib/permissions/capabilities';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ActivateAccountRequest,
  AuthTokens,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  ResendActivationRequest,
  ResetPasswordRequest,
} from '@/lib/api/types';

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

export function useActivateAccount() {
  return useMutation({
    mutationFn: async (body: ActivateAccountRequest): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/activate-account', body);
    },
  });
}

export function useResendActivation() {
  return useMutation({
    mutationFn: async (body: ResendActivationRequest): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/resend-activation', body);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (body: ForgotPasswordRequest): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/forgot-password', body);
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (body: ResetPasswordRequest): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/reset-password', body);
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
