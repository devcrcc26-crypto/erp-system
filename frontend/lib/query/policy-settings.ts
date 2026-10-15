'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPolicySettings,
  savePolicy,
  type SavePolicyPayload,
} from '@/lib/api/policy-settings';

export const policySettingsKeys = {
  all: ['policy-settings'] as const,
};

export function usePolicySettings(enabled = true) {
  return useQuery({
    queryKey: policySettingsKeys.all,
    queryFn: listPolicySettings,
    enabled,
  });
}

export function useSavePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: SavePolicyPayload }) =>
      savePolicy(key, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: policySettingsKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
    },
  });
}
