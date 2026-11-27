import {
  apiClient,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
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
  PayrollOtAdjustment,
  PayrollOtBreakdown,
  ReplacePayrollOtAdjustmentsPayload,
  UpsertPayrollOtAdjustmentPayload,
  UpdatePayrollRunPayload,
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

/** Change run settings; changing attendance recalculates the run. */
export async function updatePayrollRun(
  runId: string,
  payload: UpdatePayrollRunPayload,
): Promise<PayrollRunDetail> {
  return apiPatch<PayrollRunDetail>(`${BASE}/runs/${runId}`, payload);
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

/** Sends a SUBMITTED run back to DRAFT (approver); the reason is recorded on the run. */
export async function returnPayrollRunToDraft(
  runId: string,
  reason: string,
): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/return-to-draft`, { reason });
}

/** The submitter takes a SUBMITTED run back to DRAFT. */
export async function withdrawPayrollRun(runId: string): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/withdraw`);
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

/** Manual (paper-based) OT adjustments on a run, optionally for one employee. */
export async function listPayrollOtAdjustments(
  runId: string,
  employeeId?: string,
): Promise<PayrollOtAdjustment[]> {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  return apiGet<PayrollOtAdjustment[]>(`${BASE}/runs/${runId}/ot-adjustments${query}`);
}

/** System OT, manual OT and combined totals per category for one employee. */
export async function getPayrollOtBreakdown(
  runId: string,
  employeeId: string,
): Promise<PayrollOtBreakdown> {
  return apiGet<PayrollOtBreakdown>(
    `${BASE}/runs/${runId}/ot-adjustments/breakdown?employeeId=${encodeURIComponent(employeeId)}`,
  );
}

/** Create or update the adjustment for (employee, category); returns the new breakdown. */
export async function upsertPayrollOtAdjustment(
  runId: string,
  payload: UpsertPayrollOtAdjustmentPayload,
): Promise<PayrollOtBreakdown> {
  return apiPost<PayrollOtBreakdown>(`${BASE}/runs/${runId}/ot-adjustments`, payload);
}

/** Replace all manual OT rows for one employee in a single reprice. */
export async function replacePayrollOtAdjustments(
  runId: string,
  payload: ReplacePayrollOtAdjustmentsPayload,
): Promise<PayrollOtBreakdown> {
  return apiPut<PayrollOtBreakdown>(`${BASE}/runs/${runId}/ot-adjustments`, payload);
}

export async function deletePayrollOtAdjustment(
  runId: string,
  adjustmentId: string,
): Promise<PayrollOtBreakdown> {
  return apiDelete<PayrollOtBreakdown>(
    `${BASE}/runs/${runId}/ot-adjustments/${adjustmentId}`,
  );
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
  /** Settlement-only rows with a negative net: collect the money (Record receipt); never in the letter. */
  collectFromEmployees?: Array<{ id: string; name: string; amount: number }>;
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
