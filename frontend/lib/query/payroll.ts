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
  returnPayrollRunToDraft,
  withdrawPayrollRun,
  submitPayrollRun,
  unlockPayrollRun,
  updatePayrollCompanySettings,
  updatePayrollEntry,
  updatePayrollEntryDays,
  deletePayrollOtAdjustment,
  getPayrollOtBreakdown,
  replacePayrollOtAdjustments,
  upsertPayrollOtAdjustment,
  updatePayrollRun,
} from '@/lib/api/payroll';
import type {
  PayrollEntryDetail,
  PayrollOtBreakdown,
  PayrollRunDetail,
  ApprovePayrollRunPayload,
  CreatePayrollCorrectionPayload,
  CreatePayrollRunPayload,
  SubmitPayrollRunPayload,
  UpdatePayrollCompanySettingsPayload,
  UpdatePayrollEntryDaysPayload,
  UpdatePayrollEntryPayload,
  ReplacePayrollOtAdjustmentsPayload,
  UpsertPayrollOtAdjustmentPayload,
  UpdatePayrollRunPayload,
} from '@/lib/api/payroll.types';
import {
  entryWithOt,
  entryWithTopUp,
  previewOtBreakdown,
  runWithEntry,
} from '@/lib/utils/payroll-live';

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
    // Entry edits patch this cache in place; no reload on focus or remount.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

type QueryClient = ReturnType<typeof useQueryClient>;

/** Breakdown cache key (under the run key, so a full run reload refreshes it). */
function otBreakdownKey(runId: string, employeeId: string) {
  return [...payrollKeys.run(runId), 'ot-breakdown', employeeId] as const;
}

/** Puts one entry's new figures into the cached run and recomputes its totals. */
function patchRunEntry(
  queryClient: QueryClient,
  runId: string,
  entry: Partial<PayrollEntryDetail> & { id: string },
): void {
  queryClient.setQueryData<PayrollRunDetail>(payrollKeys.run(runId), (run) =>
    run ? runWithEntry(run, entry) : run,
  );
}

/** Runs list totals changed: refetch only when the list is next shown. */
function markRunsListStale(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: payrollKeys.runs(), refetchType: 'none' });
}

/** Saved breakdown (+ the repriced entry it carries) into the caches. */
function applyBreakdownResponse(
  queryClient: QueryClient,
  runId: string,
  employeeId: string,
  data: PayrollOtBreakdown,
): void {
  const { entry, ...breakdown } = data;
  queryClient.setQueryData(otBreakdownKey(runId, employeeId), breakdown);
  if (entry) {
    patchRunEntry(queryClient, runId, entry);
  } else {
    void queryClient.invalidateQueries({ queryKey: payrollKeys.run(runId), exact: true });
  }
  markRunsListStale(queryClient);
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

/** Run settings (consider attendance, notes). */
export function useUpdatePayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayrollRunPayload) => updatePayrollRun(runId, payload),
    onSuccess: () => invalidateRun(queryClient, runId),
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

/** Approver sends a SUBMITTED run back to DRAFT with a reason. */
export function useReturnPayrollRunToDraft(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => returnPayrollRunToDraft(runId, reason),
    onSuccess: () => invalidateRun(queryClient, runId),
  });
}

/** Submitter withdraws their SUBMITTED run back to DRAFT. */
export function useWithdrawPayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => withdrawPayrollRun(runId),
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

/**
 * Top-ups: shown at once (estimated), then the server's figures replace them;
 * rolled back if the save fails. No run reload.
 */
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
    onMutate: async ({ entryId, payload }) => {
      await queryClient.cancelQueries({ queryKey: payrollKeys.run(runId), exact: true });
      const previous = queryClient.getQueryData<PayrollRunDetail>(payrollKeys.run(runId));
      const current = previous?.entries.find((row) => row.id === entryId);
      if (current) {
        let next = current;
        if (payload.bonusTopUp !== undefined) {
          next = entryWithTopUp(next, 'taxable', payload.bonusTopUp, payload.bonusTopUpReason ?? null);
        }
        if (payload.netTopUp !== undefined) {
          next = entryWithTopUp(next, 'net', payload.netTopUp, payload.netTopUpReason ?? null);
        }
        patchRunEntry(queryClient, runId, next);
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(payrollKeys.run(runId), context.previous);
      }
    },
    onSuccess: (entry) => {
      patchRunEntry(queryClient, runId, entry as unknown as PayrollEntryDetail);
      markRunsListStale(queryClient);
    },
  });
}

/** Paid days: the server reprices (contract allowances); patch that entry only. */
export function useUpdatePayrollEntryDays(runId: string, entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayrollEntryDaysPayload) =>
      updatePayrollEntryDays(runId, entryId, payload),
    onSuccess: (entry) => {
      patchRunEntry(queryClient, runId, {
        ...(entry as unknown as PayrollEntryDetail),
        hasOverride: true,
      });
      void queryClient.invalidateQueries({
        queryKey: [...payrollKeys.run(runId), 'entry', entryId, 'audit'],
      });
      // OT is unchanged by days, except a 0-day month; refresh this employee's OT view.
      void queryClient.invalidateQueries({
        queryKey: [...payrollKeys.run(runId), 'ot-breakdown'],
      });
      markRunsListStale(queryClient);
    },
  });
}

/** System vs manual OT for one employee. */
export function usePayrollOtBreakdown(runId: string, employeeId: string, enabled = true) {
  return useQuery({
    queryKey: otBreakdownKey(runId, employeeId),
    queryFn: () => getPayrollOtBreakdown(runId, employeeId),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Saves one manual OT adjustment; patches the breakdown and the entry in place. */
export function useUpsertPayrollOtAdjustment(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertPayrollOtAdjustmentPayload) =>
      upsertPayrollOtAdjustment(runId, payload),
    onSuccess: (data, payload) =>
      applyBreakdownResponse(queryClient, runId, payload.employeeId, data),
  });
}

/**
 * Replaces all manual OT rows for one employee. The new OT, gross and net show
 * immediately (estimated); the server's figures replace them when it answers,
 * and everything rolls back if the save fails.
 */
export function useReplacePayrollOtAdjustments(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReplacePayrollOtAdjustmentsPayload) =>
      replacePayrollOtAdjustments(runId, payload),
    onMutate: async (payload) => {
      const key = otBreakdownKey(runId, payload.employeeId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: key }),
        queryClient.cancelQueries({ queryKey: payrollKeys.run(runId), exact: true }),
      ]);
      const previousBreakdown = queryClient.getQueryData<PayrollOtBreakdown>(key);
      const previousRun = queryClient.getQueryData<PayrollRunDetail>(payrollKeys.run(runId));
      if (previousBreakdown) {
        const hours = Object.fromEntries(
          payload.items.map((item) => [item.otCategory, item.hours]),
        );
        const preview = previewOtBreakdown(
          previousBreakdown,
          hours,
          payload.contractId,
        );
        queryClient.setQueryData(key, preview);
        const entry = previousRun?.entries.find((row) => row.employeeId === payload.employeeId);
        if (entry) {
          patchRunEntry(queryClient, runId, entryWithOt(entry, preview));
        }
      }
      return { previousBreakdown, previousRun };
    },
    onError: (_error, payload, context) => {
      if (context?.previousBreakdown) {
        queryClient.setQueryData(otBreakdownKey(runId, payload.employeeId), context.previousBreakdown);
      }
      if (context?.previousRun) {
        queryClient.setQueryData(payrollKeys.run(runId), context.previousRun);
      }
    },
    onSuccess: (data, payload) =>
      applyBreakdownResponse(queryClient, runId, payload.employeeId, data),
  });
}

export function useDeletePayrollOtAdjustment(runId: string, employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adjustmentId: string) => deletePayrollOtAdjustment(runId, adjustmentId),
    onSuccess: (data) => applyBreakdownResponse(queryClient, runId, employeeId, data),
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
