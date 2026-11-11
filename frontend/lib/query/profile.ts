'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ChangeEmailRequest,
  ChangePasswordRequest,
  MessageResponse,
  UpdateProfileRequest,
  UserProfile,
  UserProfileDocument,
} from '@/lib/api/types';

export const profileKeys = {
  all: ['profile'] as const,
  me: (sessionId: string | null) =>
    [...profileKeys.all, 'me', sessionId] as const,
  documents: (sessionId: string | null) =>
    [...profileKeys.all, 'documents', sessionId] as const,
  photoUrl: (sessionId: string | null) =>
    [...profileKeys.all, 'photo-url', sessionId] as const,
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

/** Download URL endpoint for one of the signed-in user's profile documents. */
export function myProfileDocumentDownloadPath(documentId: string): string {
  return `/auth/me/documents/${documentId}/download-url`;
}

/**
 * The signed-in user's own profile documents (read-only, no HR permission needed).
 */
export function useMyProfileDocuments(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionId = useAuthStore((state) => state.sessionId);
  return useQuery({
    queryKey: profileKeys.documents(sessionId),
    queryFn: () => apiGet<UserProfileDocument[]>('/auth/me/documents'),
    enabled: enabled && Boolean(accessToken && sessionId),
    retry: false,
  });
}

/**
 * Presigned URL for the signed-in user's profile picture.
 */
export function useMyProfilePhotoUrl(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionId = useAuthStore((state) => state.sessionId);
  const { data: profile } = useCurrentUser();

  return useQuery({
    queryKey: profileKeys.photoUrl(sessionId),
    queryFn: () =>
      apiGet<{ url: string; expiresIn: number }>(
        '/auth/me/photo/download-url',
      ),
    enabled:
      enabled &&
      Boolean(accessToken && sessionId && profile?.photoDocumentId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useUploadMyProfilePhoto() {
  const queryClient = useQueryClient();
  const sessionId = useAuthStore((state) => state.sessionId);
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: async (file: File): Promise<UserProfile> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<UserProfile>('/auth/me/photo', formData);
    },
    onSuccess: (profile) => {
      if (sessionId) {
        queryClient.setQueryData(profileKeys.me(sessionId), profile);
        void queryClient.invalidateQueries({
          queryKey: profileKeys.photoUrl(sessionId),
        });
      }
      updateUser({
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
    },
  });
}

export function useDeleteMyProfilePhoto() {
  const queryClient = useQueryClient();
  const sessionId = useAuthStore((state) => state.sessionId);

  return useMutation({
    mutationFn: (): Promise<UserProfile> =>
      apiDelete<UserProfile>('/auth/me/photo'),
    onSuccess: (profile) => {
      if (sessionId) {
        queryClient.setQueryData(profileKeys.me(sessionId), profile);
        void queryClient.invalidateQueries({
          queryKey: profileKeys.photoUrl(sessionId),
        });
      }
    },
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
