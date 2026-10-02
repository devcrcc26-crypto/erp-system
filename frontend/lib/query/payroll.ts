'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approvePayrollRun,
  cancelPayrollRun,
  createPayrollRun,
  generatePayrollEntries,
  getPayrollRun,
  gmApprovePayrollRun,
  listPayrollRuns,
  markPayrollRunPaid,
  markPayrollRunReviewed,
  recalculatePayrollRun,
  submitPayrollRun,
  updatePayrollEntry,
} from '@/lib/api/payroll';
import type {
  CreatePayrollRunPayload,
  SubmitPayrollRunPayload,
  UpdatePayrollEntryPayload,
} from '@/lib/api/payroll.types';

export const payrollKeys = {
  all: ['payroll'] as const,
  runs: () => [...payrollKeys.all, 'runs'] as const,
  run: (id: string) => [...payrollKeys.all, 'run', id] as const,
};

export function usePayrollRuns(enabled = true) {
  return useQuery({
    queryKey: payrollKeys.runs(),
    queryFn: listPayrollRuns,
    enabled,
  });
}

export function usePayrollRun(id: string, enabled = true) {
  return useQuery({
    queryKey: payrollKeys.run(id),
    queryFn: () => getPayrollRun(id),
    enabled: enabled && Boolean(id),
  });
}

function invalidateRun(queryClient: ReturnType<typeof useQueryClient>, id: string): void {
  void queryClient.invalidateQueries({ queryKey: payrollKeys.runs() });
  void queryClient.invalidateQueries({ queryKey: payrollKeys.run(id) });
}

export function useCreatePayrollRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePayrollRunPayload) => createPayrollRun(payload),
    onSuccess: (run) => invalidateRun(queryClient, run.id),
  });
}

export function useGeneratePayrollEntries(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generatePayrollEntries(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useRecalculatePayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recalculatePayrollRun(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useMarkPayrollRunReviewed(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markPayrollRunReviewed(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useSubmitPayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPayrollRunPayload) =>
      submitPayrollRun(runId, payload),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useApprovePayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => approvePayrollRun(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useGmApprovePayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gmApprovePayrollRun(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useMarkPayrollRunPaid(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markPayrollRunPaid(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useCancelPayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelPayrollRun(runId),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useUpdatePayrollEntry(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      payload,
    }: {
      entryId: string;
      payload: UpdatePayrollEntryPayload;
    }) => updatePayrollEntry(entryId, payload),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}
