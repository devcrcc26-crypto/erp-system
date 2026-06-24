'use client';

import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import {
  completeLocalSignIn,
  signOutLocally,
} from '@/lib/auth/sign-out-locally';
import { fetchCapabilities } from '@/lib/permissions/capabilities';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ActivateAccountRequest,
  AuthTokens,
  Capabilities,
  ConfirmEmailChangeRequest,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  ResendActivationRequest,
  ResetPasswordRequest,
} from '@/lib/api/types';

/** TanStack Query key for session capabilities - shared across login and session sync. */
export const sessionCapabilitiesQueryKey = ['auth', 'capabilities'] as const;

/** Capabilities rarely change mid-session; cache 60s to avoid duplicate /auth/capabilities calls. */
export const SESSION_CAPABILITIES_STALE_MS = 60_000;

async function loadSessionCapabilities(): Promise<Capabilities> {
  return fetchCapabilities();
}

/**
 * Loads session capabilities once per cache window and mirrors them into Zustand.
 */
export function useSessionCapabilities(enabled: boolean): UseQueryResult<Capabilities> {
  const setCapabilities = useAuthStore((state) => state.setCapabilities);

  const query = useQuery({
    queryKey: sessionCapabilitiesQueryKey,
    queryFn: loadSessionCapabilities,
    enabled,
    staleTime: SESSION_CAPABILITIES_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.data) {
      setCapabilities(query.data);
    }
  }, [query.data, setCapabilities]);

  return query;
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((state) => state.setAuth);
  const setCapabilities = useAuthStore((state) => state.setCapabilities);

  return useMutation({
    mutationFn: async (credentials: LoginRequest): Promise<AuthTokens> => {
      signOutLocally({ broadcast: false });

      return apiPost<AuthTokens>('/auth/login', {
        ...credentials,
        deviceInfo:
          credentials.deviceInfo ??
          (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      });
    },
    onSuccess: async (tokens) => {
      setAuth(tokens);
      completeLocalSignIn();
      const capabilities = await queryClient.fetchQuery({
        queryKey: sessionCapabilitiesQueryKey,
        queryFn: loadSessionCapabilities,
        staleTime: SESSION_CAPABILITIES_STALE_MS,
      });
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

export function useConfirmEmailChange() {
  return useMutation({
    mutationFn: async (body: ConfirmEmailChangeRequest): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/confirm-email-change', body);
    },
    retry: false,
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async (): Promise<MessageResponse> => {
      return apiPost<MessageResponse>('/auth/logout');
    },
    onSettled: () => {
      signOutLocally();
    },
  });
}
