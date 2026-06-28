'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ChangeEmailRequest,
  ChangePasswordRequest,
  MessageResponse,
  UpdateProfileRequest,
  UserProfile,
} from '@/lib/api/types';

export const profileKeys = {
  all: ['profile'] as const,
  me: (sessionId: string | null) =>
    [...profileKeys.all, 'me', sessionId] as const,
};

export function useCurrentUser() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionId = useAuthStore((state) => state.sessionId);
  return useQuery({
    queryKey: profileKeys.me(sessionId),
    queryFn: (): Promise<UserProfile> => apiGet<UserProfile>('/auth/me'),
    enabled: Boolean(accessToken && sessionId),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  const sessionId = useAuthStore((state) => state.sessionId);

  return useMutation({
    mutationFn: (body: UpdateProfileRequest): Promise<UserProfile> =>
      apiPatch<UserProfile>('/auth/me', body),
    onSuccess: (profile) => {
      if (sessionId) {
        queryClient.setQueryData(profileKeys.me(sessionId), profile);
      }
      updateUser({
        firstName: profile.firstName,
        lastName: profile.lastName,
        preferredLanguage: profile.preferredLanguage,
        preferredTimezone: profile.preferredTimezone,
        preferredDateFormat: profile.preferredDateFormat,
      });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest): Promise<MessageResponse> =>
      apiPost<MessageResponse>('/auth/change-password', body),
  });
}

export function useChangeEmail() {
  const queryClient = useQueryClient();
  const sessionId = useAuthStore((state) => state.sessionId);

  return useMutation({
    mutationFn: (body: ChangeEmailRequest): Promise<MessageResponse> =>
      apiPost<MessageResponse>('/auth/change-email', body),
    onSuccess: () => {
      if (sessionId) {
        void queryClient.invalidateQueries({ queryKey: profileKeys.me(sessionId) });
      }
    },
  });
}
