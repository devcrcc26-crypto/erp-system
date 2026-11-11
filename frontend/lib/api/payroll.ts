import {
  apiClient,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  downloadApiFile,
} from '@/lib/api/client';
import type {
  ApprovePayrollRunPayload,
  CreatePayrollCorrectionPayload,
  CreatePayrollRunPayload,
  EmployeePayslip,
  PayrollCompanySettings,
  PayrollEmploymentReviewEntry,
  PayrollEntryAuditRecord,
  PayrollEntryDetail,
  PayrollFreelancerOption,
  PayrollRunDetail,
  PayrollRunListItem,
  PayslipGenerateResult,
  PayslipReleaseResult,
  SubmitPayrollRunPayload,
  UpdatePayrollCompanySettingsPayload,
  UpdatePayrollEntryDaysPayload,
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

export async function listAvailablePayrollFreelancers(
  runId: string,
): Promise<PayrollFreelancerOption[]> {
  return apiGet<PayrollFreelancerOption[]>(`${BASE}/runs/${runId}/freelancers/available`);
}

export async function addPayrollFreelancers(
  runId: string,
  employeeIds: string[],
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/freelancers`, { employeeIds });
}

export async function removePayrollFreelancerEntry(
  runId: string,
  entryId: string,
): Promise<PayrollRunDetail> {
  return apiDelete<PayrollRunDetail>(`${BASE}/runs/${runId}/entries/${entryId}`);
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
  payload: ApprovePayrollRunPayload = {},
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/approve`, payload);
}

export async function gmApprovePayrollRun(
  runId: string,
  payload: ApprovePayrollRunPayload = {},
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/gm-approve`, payload);
}

export async function getPayrollEmploymentReview(
  runId: string,
): Promise<PayrollEmploymentReviewEntry[]> {
  return apiGet<PayrollEmploymentReviewEntry[]>(`${BASE}/runs/${runId}/employment-review`);
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

export async function createPayrollCorrection(
  runId: string,
  payload: CreatePayrollCorrectionPayload = {},
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/correction`, payload);
}

export async function unlockPayrollRun(
  runId: string,
): Promise<PayrollRunDetail> {
  return apiPatch<PayrollRunDetail>(`${BASE}/runs/${runId}/unlock`);
}

export async function updatePayrollEntry(
  entryId: string,
  payload: UpdatePayrollEntryPayload,
): Promise<PayrollEntryDetail> {
  return apiPatch<PayrollEntryDetail>(`${BASE}/entries/${entryId}`, payload);
}

export async function updatePayrollEntryDays(
  runId: string,
  entryId: string,
  payload: UpdatePayrollEntryDaysPayload,
): Promise<PayrollEntryDetail> {
  return apiPatch<PayrollEntryDetail>(
    `${BASE}/runs/${runId}/entries/${entryId}/days`,
    payload,
  );
}

export async function getPayrollEntryAudit(
  runId: string,
  entryId: string,
): Promise<PayrollEntryAuditRecord[]> {
  return apiGet<PayrollEntryAuditRecord[]>(`${BASE}/runs/${runId}/entries/${entryId}/audit`);
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

export interface BankLetterPreview {
  allowed: boolean;
  refNo: string | null;
  totalNet: number;
  includedCount: number;
  excludedEmployees: Array<{ id: string; name: string }>;
  reason?: string | null;
}

/**
 * Preview bank letter inclusion before downloading the Word file.
 */
export async function previewPayrollBankLetter(
  runId: string,
): Promise<BankLetterPreview> {
  return apiGet<BankLetterPreview>(
    `${BASE}/runs/${runId}/export/bank-letter/preview`,
  );
}

/**
 * Downloads the bank transfer letter (.docx) for a GM-approved or paid run.
 */
export async function downloadPayrollBankLetter(
  runId: string,
  filename: string,
): Promise<{ excludedAccounts: string[]; refNo: string | null }> {
  const { headers } = await downloadApiFile(
    `${BASE}/runs/${runId}/export/bank-letter`,
    filename,
  );
  const excludedRaw = headers['x-payroll-excluded-accounts'] ?? '';
  const excludedAccounts = excludedRaw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const refNo = headers['x-payroll-bank-letter-ref'] ?? null;
  return { excludedAccounts, refNo };
}

export async function getPayrollCompanySettings(): Promise<PayrollCompanySettings> {
  return apiGet<PayrollCompanySettings>(`${BASE}/company-settings`);
}

export async function updatePayrollCompanySettings(
  payload: UpdatePayrollCompanySettingsPayload,
): Promise<PayrollCompanySettings> {
  return apiPatch<PayrollCompanySettings>(`${BASE}/company-settings`, payload);
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
