'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  addPayrollAdjustmentLine,
  addPayrollCorrectionLine,
  createPayrollAdjustmentType,
  getPayrollCorrectionLines,
  getPayrollRunHistory,
  getPayrollRunRemittance,
  getPayrollRunWarnings,
  getPayrollSettlementSuggestion,
  listPayrollAdjustmentLines,
  listPayrollAdjustmentTypes,
  listPayrollReconciliations,
  recordPayrollReconciliationReceipt,
  removePayrollAdjustmentLine,
  reopenPayrollRun,
  unwaivePayrollReconciliation,
  updatePayrollAdjustmentType,
  waivePayrollReconciliation,
  type AddPayrollAdjustmentLinePayload,
  type AddPayrollCorrectionLinePayload,
  type PayrollAdjustmentTypePayload,
  type RecordPayrollReceiptPayload,
} from '@/lib/api/payroll-adjustments';
import { payrollKeys } from '@/lib/query/payroll';

export const payrollAdjustmentKeys = {
  warnings: (runId: string) => [...payrollKeys.run(runId), 'warnings'] as const,
  history: (runId: string) => [...payrollKeys.run(runId), 'history'] as const,
  remittance: (runId: string) => [...payrollKeys.run(runId), 'remittance'] as const,
  lines: (runId: string) => [...payrollKeys.run(runId), 'adjustment-lines'] as const,
  correctionLines: (runId: string, employeeId?: string) =>
    [...payrollKeys.run(runId), 'correction-lines', employeeId ?? 'all'] as const,
  suggestion: (runId: string, reconciliationId: string) =>
    [...payrollKeys.run(runId), 'settlement-suggestion', reconciliationId] as const,
  reconciliations: (scope: string) => [...payrollKeys.all, 'reconciliations', scope] as const,
  types: () => [...payrollKeys.all, 'adjustment-types'] as const,
};

/** Lines changed: the run's entries, totals and warnings all move. */
function invalidateRunAdjustments(queryClient: QueryClient, runId: string): void {
  void queryClient.invalidateQueries({ queryKey: payrollKeys.run(runId) });
  void queryClient.invalidateQueries({ queryKey: payrollKeys.runs() });
  void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'reconciliations'] });
}

export function usePayrollRunWarnings(runId: string, enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.warnings(runId),
    queryFn: () => getPayrollRunWarnings(runId),
    enabled: enabled && Boolean(runId),
  });
}

export function usePayrollRunRemittance(runId: string, enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.remittance(runId),
    queryFn: () => getPayrollRunRemittance(runId),
    enabled: enabled && Boolean(runId),
  });
}

export function usePayrollRunHistory(runId: string, enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.history(runId),
    queryFn: () => getPayrollRunHistory(runId),
    enabled: enabled && Boolean(runId),
  });
}

export function usePayrollCorrectionLines(runId: string, employeeId: string | null, enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.correctionLines(runId, employeeId ?? undefined),
    queryFn: () => getPayrollCorrectionLines(runId, employeeId ?? undefined),
    enabled: enabled && Boolean(runId) && Boolean(employeeId),
  });
}

export function usePayrollAdjustmentLines(runId: string, enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.lines(runId),
    queryFn: () => listPayrollAdjustmentLines(runId),
    enabled: enabled && Boolean(runId),
  });
}

export function useAddPayrollAdjustmentLine(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddPayrollAdjustmentLinePayload) =>
      addPayrollAdjustmentLine(runId, payload),
    onSuccess: (lines) => {
      queryClient.setQueryData(payrollAdjustmentKeys.lines(runId), lines);
      invalidateRunAdjustments(queryClient, runId);
    },
  });
}

/** Adds a manual correction line; the entry, net difference and component lines are repriced. */
export function useAddPayrollCorrectionLine(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddPayrollCorrectionLinePayload) =>
      addPayrollCorrectionLine(runId, payload),
    onSuccess: (lines) => {
      queryClient.setQueryData(payrollAdjustmentKeys.lines(runId), lines);
      void queryClient.invalidateQueries({
        queryKey: [...payrollKeys.run(runId), 'correction-lines'],
      });
      invalidateRunAdjustments(queryClient, runId);
    },
  });
}

export function useRemovePayrollAdjustmentLine(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => removePayrollAdjustmentLine(runId, lineId),
    onSuccess: (lines) => {
      queryClient.setQueryData(payrollAdjustmentKeys.lines(runId), lines);
      void queryClient.invalidateQueries({
        queryKey: [...payrollKeys.run(runId), 'correction-lines'],
      });
      invalidateRunAdjustments(queryClient, runId);
    },
  });
}

export function usePayrollSettlementSuggestion(
  runId: string,
  reconciliationId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.suggestion(runId, reconciliationId ?? ''),
    queryFn: () => getPayrollSettlementSuggestion(runId, reconciliationId as string),
    enabled: enabled && Boolean(runId) && Boolean(reconciliationId),
  });
}

export function useOpenPayrollReconciliations(enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.reconciliations('open'),
    queryFn: () => listPayrollReconciliations({ status: 'open' }),
    enabled,
  });
}

export function useWaivePayrollReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      waivePayrollReconciliation(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'reconciliations'] });
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'run'] });
    },
  });
}

/** Record receipt: settles an item owed to the company; settlement-only rows and totals move. */
export function useRecordPayrollReconciliationReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecordPayrollReceiptPayload }) =>
      recordPayrollReconciliationReceipt(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'reconciliations'] });
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'run'] });
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs() });
    },
  });
}

export function useUnwaivePayrollReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwaivePayrollReconciliation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'reconciliations'] });
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'run'] });
    },
  });
}

export function useReopenPayrollRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => reopenPayrollRun(runId, reason),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs() });
      void queryClient.invalidateQueries({ queryKey: payrollKeys.run(runId) });
      void queryClient.invalidateQueries({ queryKey: payrollKeys.run(next.id) });
      void queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'reconciliations'] });
    },
  });
}

export function usePayrollAdjustmentTypes(enabled = true) {
  return useQuery({
    queryKey: payrollAdjustmentKeys.types(),
    queryFn: listPayrollAdjustmentTypes,
    enabled,
    staleTime: 60_000,
  });
}

export function useSavePayrollAdjustmentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string | null; payload: PayrollAdjustmentTypePayload }) =>
      id ? updatePayrollAdjustmentType(id, payload) : createPayrollAdjustmentType(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollAdjustmentKeys.types() });
    },
  });
}
