import { apiClient, apiGet, apiPatch, apiPost, downloadApiFile } from '@/lib/api/client';
import type {
  CreatePayrollRunPayload,
  EmployeePayslip,
  PayrollEntryDetail,
  PayrollRunDetail,
  PayrollRunListItem,
  PayslipGenerateResult,
  PayslipReleaseResult,
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

export async function generatePayslips(
  runId: string,
): Promise<PayslipGenerateResult> {
  return apiPost<PayslipGenerateResult>(`${BASE}/runs/${runId}/payslips/generate`);
}

export async function releasePayslips(
  runId: string,
): Promise<PayslipReleaseResult> {
  return apiPost<PayslipReleaseResult>(`${BASE}/runs/${runId}/payslips/release`);
}

export async function downloadPayslipZip(
  runId: string,
  filename: string,
): Promise<void> {
  await downloadApiFile(`${BASE}/runs/${runId}/payslips/zip`, filename);
}

export async function listMyPayslips(): Promise<EmployeePayslip[]> {
  return apiGet<EmployeePayslip[]>(`${BASE}/my-payslips`);
}

export async function listEmployeePayslips(
  employeeId: string,
): Promise<EmployeePayslip[]> {
  return apiGet<EmployeePayslip[]>(`${BASE}/employees/${employeeId}/payslips`);
}

/**
 * Fetches a payslip PDF with the session token and opens it in a new tab.
 */
export async function openPayslipPdf(payslipId: string): Promise<void> {
  const response = await apiClient.get(`${BASE}/payslips/${payslipId}/pdf`, {
    responseType: 'blob',
  });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' && contentType.includes('pdf')
      ? contentType
      : 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
