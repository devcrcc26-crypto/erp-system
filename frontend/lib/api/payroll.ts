import { apiGet, apiPatch, apiPost, downloadApiFile } from '@/lib/api/client';
import type {
  CreatePayrollRunPayload,
  PayrollEntryDetail,
  PayrollRunDetail,
  PayrollRunListItem,
  SubmitPayrollRunPayload,
  UpdatePayrollEntryPayload,
} from '@/lib/api/payroll.types';

const BASE = '/payroll';

export async function listPayrollRuns(): Promise<PayrollRunListItem[]> {
  return apiGet<PayrollRunListItem[]>(`${BASE}/runs`);
}

export async function getPayrollRun(id: string): Promise<PayrollRunDetail> {
  return apiGet<PayrollRunDetail>(`${BASE}/runs/${id}`);
}

export async function createPayrollRun(
  payload: CreatePayrollRunPayload,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs`, payload);
}

export async function generatePayrollEntries(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/generate`);
}

export async function recalculatePayrollRun(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/recalculate`);
}

export async function markPayrollRunReviewed(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/mark-reviewed`);
}

export async function submitPayrollRun(
  runId: string,
  payload: SubmitPayrollRunPayload = {},
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/submit`, payload);
}

export async function approvePayrollRun(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/approve`);
}

export async function gmApprovePayrollRun(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/gm-approve`);
}

export async function markPayrollRunPaid(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/mark-paid`);
}

export async function cancelPayrollRun(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/cancel`);
}

export async function updatePayrollEntry(
  entryId: string,
  payload: UpdatePayrollEntryPayload,
): Promise<PayrollEntryDetail> {
  return apiPatch<PayrollEntryDetail>(`${BASE}/entries/${entryId}`, payload);
}

/**
 * Downloads the payroll run Excel export (HR salary-sheet layout).
 */
export async function downloadPayrollRunExcel(
  runId: string,
  filename: string,
): Promise<void> {
  await downloadApiFile(`${BASE}/runs/${runId}/export/excel`, filename);
}
