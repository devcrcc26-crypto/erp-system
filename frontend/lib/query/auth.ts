'use client';

import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { signOutLocally } from '@/lib/auth/sign-out-locally';
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

/** TanStack Query key for session capabilities - scoped per session to avoid stale user data. */
export const sessionCapabilitiesQueryKey = (sessionId: string | null) =>
  ['auth', 'capabilities', sessionId] as const;

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
  const sessionId = useAuthStore((state) => state.sessionId);
  const capabilitiesReady = useAuthStore((state) => state.capabilitiesReady);
  const sessionEnabled = enabled && Boolean(sessionId);

  const query = useQuery({
    queryKey: sessionCapabilitiesQueryKey(sessionId),
    queryFn: loadSessionCapabilities,
    enabled: sessionEnabled,
    staleTime: SESSION_CAPABILITIES_STALE_MS,
    retry: (failureCount, error) => {
      if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        return false;
      }
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data || !sessionId) {
      return;
    }
    if (useAuthStore.getState().sessionId !== sessionId) {
      return;
    }
    setCapabilities(query.data);
  }, [query.data, sessionId, capabilitiesReady, setCapabilities]);

  return query;
}

export function useLogin() {
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
      // Cap wait so a hung API cannot block redirect forever.
      return Promise.race([
        apiPost<MessageResponse>('/auth/logout'),
        new Promise<MessageResponse>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('Logout request timed out')),
            5000,
          );
        }),
      ]);
    },
    onSettled: () => {
      signOutLocally();
    },
  });
}
