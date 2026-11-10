'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addPayrollFreelancers,
  listAvailablePayrollFreelancers,
  removePayrollFreelancerEntry,
  approvePayrollRun,
  cancelPayrollRun,
  createPayrollCorrection,
  createPayrollRun,
  generatePayrollEntries,
  generatePayslips,
  getPayrollCompanySettings,
  getPayrollRun,
  gmApprovePayrollRun,
  getPayrollEmploymentReview,
  getPayrollEntryAudit,
  listEmployeePayslips,
  listMyPayslips,
  listPayrollRuns,
  markPayrollRunPaid,
  markPayrollRunReviewed,
  recalculatePayrollRun,
  releasePayslips,
  submitPayrollRun,
  unlockPayrollRun,
  updatePayrollCompanySettings,
  updatePayrollEntry,
  updatePayrollEntryDays,
} from '@/lib/api/payroll';
import type {
  ApprovePayrollRunPayload,
  CreatePayrollCorrectionPayload,
  CreatePayrollRunPayload,
  SubmitPayrollRunPayload,
  UpdatePayrollCompanySettingsPayload,
  UpdatePayrollEntryDaysPayload,
  UpdatePayrollEntryPayload,
} from '@/lib/api/payroll.types';

export const payrollKeys = {
  all: ['payroll'] as const,
  runs: () => [...payrollKeys.all, 'runs'] as const,
  run: (id: string) => [...payrollKeys.all, 'run', id] as const,
  employmentReview: (id: string) => [...payrollKeys.all, 'run', id, 'employment-review'] as const,
  companySettings: () => [...payrollKeys.all, 'company-settings'] as const,
  myPayslips: () => [...payrollKeys.all, 'my-payslips'] as const,
  employeePayslips: (employeeId: string) =>
    [...payrollKeys.all, 'employee-payslips', employeeId] as const,
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

function invalidatePayslips(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: payrollKeys.myPayslips() });
  void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'employee-payslips'] });
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

export function useAvailablePayrollFreelancers(runId: string, enabled = true) {
  return useQuery({
    queryKey: [...payrollKeys.run(runId), 'available-freelancers'] as const,
    queryFn: () => listAvailablePayrollFreelancers(runId),
    enabled: enabled && Boolean(runId),
  });
}

export function useAddPayrollFreelancers(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (employeeIds: string[]) => addPayrollFreelancers(runId, employeeIds),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useRemovePayrollFreelancerEntry(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => removePayrollFreelancerEntry(runId, entryId),
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
    mutationFn: (payload: ApprovePayrollRunPayload = {}) => approvePayrollRun(runId, payload),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

export function useGmApprovePayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApprovePayrollRunPayload = {}) => gmApprovePayrollRun(runId, payload),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

/** Employment-flagged entries to review before submit / approve (prefix of the run key). */
export function usePayrollEmploymentReview(runId: string, enabled = true) {
  return useQuery({
    queryKey: payrollKeys.employmentReview(runId),
    queryFn: () => getPayrollEmploymentReview(runId),
    enabled: enabled && Boolean(runId),
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

export function useCreatePayrollCorrection(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePayrollCorrectionPayload = {}) =>
      createPayrollCorrection(runId, payload),
    onSuccess: (run) => {
      invalidateRun(queryClient, runId);
      invalidateRun(queryClient, run.id);
    },
  });
}

export function useUnlockPayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unlockPayrollRun(runId),
    onSuccess: () => {
      invalidateRun(queryClient, runId);
      invalidatePayslips(queryClient);
    },
  });
}

export function useGeneratePayslips(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generatePayslips(runId),
    onSuccess: () => {
      invalidateRun(queryClient, runId);
      invalidatePayslips(queryClient);
    },
  });
}

export function useReleasePayslips(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => releasePayslips(runId),
    onSuccess: () => {
      invalidateRun(queryClient, runId);
      invalidatePayslips(queryClient);
    },
  });
}

export function useMyPayslips(enabled = true) {
  return useQuery({
    queryKey: payrollKeys.myPayslips(),
    queryFn: listMyPayslips,
    enabled,
  });
}

export function useEmployeePayslips(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: payrollKeys.employeePayslips(employeeId),
    queryFn: () => listEmployeePayslips(employeeId),
    enabled: enabled && Boolean(employeeId),
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

export function useUpdatePayrollEntryDays(runId: string, entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayrollEntryDaysPayload) =>
      updatePayrollEntryDays(runId, entryId, payload),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

/** Override history of one entry (prefix of the run key, so saves refresh it). */
export function usePayrollEntryAudit(runId: string, entryId: string, enabled = true) {
  return useQuery({
    queryKey: [...payrollKeys.run(runId), 'entry', entryId, 'audit'] as const,
    queryFn: () => getPayrollEntryAudit(runId, entryId),
    enabled,
  });
}

export function usePayrollCompanySettings(enabled = true) {
  return useQuery({
    queryKey: payrollKeys.companySettings(),
    queryFn: getPayrollCompanySettings,
    enabled,
  });
}

export function useUpdatePayrollCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayrollCompanySettingsPayload) =>
      updatePayrollCompanySettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(payrollKeys.companySettings(), data);
    },
  });
}
