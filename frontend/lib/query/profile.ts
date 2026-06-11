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
  me: () => [...profileKeys.all, 'me'] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: (): Promise<UserProfile> => apiGet<UserProfile>('/auth/me'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: (body: UpdateProfileRequest): Promise<UserProfile> =>
      apiPatch<UserProfile>('/auth/me', body),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKeys.me(), profile);
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

  return useMutation({
    mutationFn: (body: ChangeEmailRequest): Promise<MessageResponse> =>
      apiPost<MessageResponse>('/auth/change-email', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.me() });
    },
  });
}
