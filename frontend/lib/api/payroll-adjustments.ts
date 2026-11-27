import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api/client';
import type { PayrollRunDetail, PayrollRunStatus, PayrollRunType } from '@/lib/api/payroll.types';

const BASE = '/payroll';

// ── Types ────────────────────────────────────────────────────────────────

export type PayrollAdjustmentKind = 'EARNING' | 'DEDUCTION';
/** STATUTORY_ONLY: net unchanged, tax / pension differ - nothing paid or recovered. */
export type PayrollReconciliationDirection = 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY' | 'STATUTORY_ONLY';
export type PayrollReconciliationStatus = 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'WAIVED';

export interface PayrollAdjustmentType {
  id: string;
  code: string;
  nameEn: string;
  nameZh: string | null;
  kind: PayrollAdjustmentKind;
  taxable: boolean;
  pensionable: boolean;
  active: boolean;
  /** BONUS_TOP_UP / NET_TOP_UP: built-in types whose kind and flags are fixed. */
  systemField: string | null;
  sortOrder: number;
}

export interface PayrollAdjustmentTypePayload {
  code?: string;
  nameEn?: string;
  nameZh?: string;
  kind?: PayrollAdjustmentKind;
  taxable?: boolean;
  pensionable?: boolean;
  active?: boolean;
}

export interface PayrollAdjustmentLine {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  adjustmentTypeId: string;
  typeCode: string;
  typeNameEn: string;
  typeNameZh: string | null;
  /** BONUS_TOP_UP / NET_TOP_UP: built-in bonus types kept in the entry's bonus fields. */
  systemField: string | null;
  kind: PayrollAdjustmentKind;
  taxable: boolean;
  pensionable: boolean;
  amount: number;
  note: string;
  reconciliationId: string | null;
  instalmentNumber: number | null;
  instalmentCount: number | null;
  capOverrideReason: string | null;
  /** e.g. "Recovery / deduction – October 2026 correction (1 of 3)". */
  label: string;
  /** Manual correction line: direction and treatment were chosen on the line itself. */
  isCorrectionLine: boolean;
  direction: PayrollCorrectionDirection;
  treatment: PayrollCorrectionTreatment;
  createdAt: string;
}

/** OWED_TO_EMPLOYEE = earning, OWED_TO_COMPANY = deduction. */
export type PayrollCorrectionDirection = 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY';
/** Taxable changes tax and pension; Net changes the corrected net pay only. */
export type PayrollCorrectionTreatment = 'TAXABLE' | 'NET';

export interface AddPayrollCorrectionLinePayload {
  employeeId: string;
  adjustmentTypeId: string;
  direction: PayrollCorrectionDirection;
  treatment: PayrollCorrectionTreatment;
  amount: number;
  note: string;
}

export interface PayrollReconciliationReceipt {
  id: string;
  amount: number;
  /** YYYY-MM-DD. */
  receivedOn: string;
  reference: string;
  note: string | null;
  createdAt: string;
}

export interface RecordPayrollReceiptPayload {
  amount: number;
  /** YYYY-MM-DD. */
  receivedOn: string;
  reference: string;
  note?: string;
}

export interface AddPayrollAdjustmentLinePayload {
  employeeId: string;
  adjustmentTypeId: string;
  amount: number;
  note: string;
  reconciliationId?: string;
  capOverrideReason?: string;
}

export interface PayrollReconciliation {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  forMonth: number;
  forYear: number;
  correctionRunId: string;
  correctionRunNumber: string;
  direction: PayrollReconciliationDirection;
  amount: number;
  settledAmount: number;
  remaining: number;
  pendingAmount: number;
  incomeTaxDifference: number;
  employeePensionDifference: number;
  employerPensionDifference: number;
  statutoryRunId: string | null;
  reason: string;
  status: PayrollReconciliationStatus;
  waivedReason: string | null;
  waivedAt: string | null;
  /** Money collected outside payroll (Record receipt). */
  receipts: PayrollReconciliationReceipt[];
  createdAt: string;
}

export interface PayrollSettlementSuggestion {
  reconciliationId: string;
  direction: PayrollReconciliationDirection;
  remaining: number;
  amount: number;
  suggestedTypeId: string | null;
  recovery: {
    amount: number;
    cap: number;
    capRemaining: number;
    estimatedInstalments: number | null;
    monthlyWage: number;
  } | null;
  instalmentNumber: number;
  /** The employee's row is settlement only: no one-third limit, the full balance is suggested. */
  settlementOnly: boolean;
}

interface WarningEmployee {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
}

export interface PayrollRunWarnings {
  runId: string;
  pendingOvertime: Array<
    WarningEmployee & {
      sheetId: string;
      sheetNumber: string;
      sheetStatus: string;
      entries: number;
      hours: number;
    }
  >;
  overtimeNotIncluded: Array<
    WarningEmployee & {
      sheetId: string;
      sheetNumber: string;
      sheetStatus: string;
      entries: number;
      hours: number;
    }
  >;
  /** OT entries this run priced that changed after calculation (not claimed on approve). */
  overtimeChangedSinceCalculation: Array<
    WarningEmployee & {
      sheetId: string;
      sheetNumber: string;
      sheetStatus: string;
      entries: number;
      hours: number;
    }
  >;
  openReconciliations: Array<
    WarningEmployee & {
      id: string;
      direction: PayrollReconciliationDirection;
      amount: number;
      remaining: number;
      forMonth: number;
      forYear: number;
      /** The employee is on a "Settlement only" row of this run. */
      settlementOnly: boolean;
    }
  >;
  deductionsOverCap: Array<WarningEmployee & { deductions: number; cap: number }>;
  /** A settlement-only row with a negative net is money to collect, not an error. */
  negativeNetPay: Array<WarningEmployee & { netPay: number; settlementOnly: boolean }>;
}

export interface PayrollRunHistoryItem {
  id: string;
  runNumber: string;
  type: PayrollRunType;
  version: number;
  status: PayrollRunStatus;
  createdAt: string;
  approvedAt: string | null;
  gmApprovedAt: string | null;
  paidAt: string | null;
  reopenReason: string | null;
  reopenedAt: string | null;
  reopenedByName: string | null;
  previousVersionId: string | null;
  originalRunId: string | null;
  totalNetPay: number;
}

export interface PayrollRunHistory {
  versions: PayrollRunHistoryItem[];
  corrections: PayrollRunHistoryItem[];
  originalRun: PayrollRunHistoryItem | null;
}

export interface PayrollRemittanceLine {
  label: string;
  amount: number;
  detail: string | null;
  /** Employee number of the carried item (null for the run's own figure). */
  employeeCode?: string | null;
  reconciliationId: string | null;
  /** True until the run is approved (preview). */
  pending: boolean;
}

export interface PayrollRemittanceSection {
  runAmount: number;
  adjustments: PayrollRemittanceLine[];
  total: number;
}

export interface PayrollRunRemittance {
  incomeTax: PayrollRemittanceSection;
  pensionEmployee: PayrollRemittanceSection;
  pensionEmployer: PayrollRemittanceSection;
}

export interface PayrollCorrectionLine {
  employeeId: string;
  component: string;
  sortOrder: number;
  paidAmount: number;
  correctedAmount: number;
  difference: number;
}

// ── API ──────────────────────────────────────────────────────────────────

export function reopenPayrollRun(runId: string, reason: string): Promise<PayrollRunDetail> {
  return apiPost<PayrollRunDetail>(`${BASE}/runs/${runId}/reopen`, { reason });
}

export function getPayrollRunWarnings(runId: string): Promise<PayrollRunWarnings> {
  return apiGet<PayrollRunWarnings>(`${BASE}/runs/${runId}/warnings`);
}

export function getPayrollRunRemittance(runId: string): Promise<PayrollRunRemittance> {
  return apiGet<PayrollRunRemittance>(`${BASE}/runs/${runId}/remittance`);
}

export function getPayrollRunHistory(runId: string): Promise<PayrollRunHistory> {
  return apiGet<PayrollRunHistory>(`${BASE}/runs/${runId}/history`);
}

export function getPayrollCorrectionLines(
  runId: string,
  employeeId?: string,
): Promise<PayrollCorrectionLine[]> {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  return apiGet<PayrollCorrectionLine[]>(`${BASE}/runs/${runId}/correction-lines${query}`);
}

export function listPayrollAdjustmentLines(runId: string): Promise<PayrollAdjustmentLine[]> {
  return apiGet<PayrollAdjustmentLine[]>(`${BASE}/runs/${runId}/adjustments`);
}

export function addPayrollAdjustmentLine(
  runId: string,
  payload: AddPayrollAdjustmentLinePayload,
): Promise<PayrollAdjustmentLine[]> {
  return apiPost<PayrollAdjustmentLine[]>(`${BASE}/runs/${runId}/adjustments`, payload);
}

/** Adds a manual correction line (missed bonus, severance, arrears, other) on a correction run. */
export function addPayrollCorrectionLine(
  runId: string,
  payload: AddPayrollCorrectionLinePayload,
): Promise<PayrollAdjustmentLine[]> {
  return apiPost<PayrollAdjustmentLine[]>(`${BASE}/runs/${runId}/correction-adjustments`, payload);
}

export function removePayrollAdjustmentLine(
  runId: string,
  lineId: string,
): Promise<PayrollAdjustmentLine[]> {
  return apiDelete<PayrollAdjustmentLine[]>(`${BASE}/runs/${runId}/adjustments/${lineId}`);
}

export function getPayrollSettlementSuggestion(
  runId: string,
  reconciliationId: string,
): Promise<PayrollSettlementSuggestion> {
  return apiGet<PayrollSettlementSuggestion>(
    `${BASE}/runs/${runId}/reconciliations/${reconciliationId}/suggestion`,
  );
}

export function listPayrollReconciliations(params: {
  status?: 'open' | 'all';
  employeeId?: string;
  correctionRunId?: string;
} = {}): Promise<PayrollReconciliation[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.employeeId) query.set('employeeId', params.employeeId);
  if (params.correctionRunId) query.set('correctionRunId', params.correctionRunId);
  const qs = query.toString();
  return apiGet<PayrollReconciliation[]>(`${BASE}/reconciliations${qs ? `?${qs}` : ''}`);
}

export function waivePayrollReconciliation(
  id: string,
  reason: string,
): Promise<PayrollReconciliation> {
  return apiPost<PayrollReconciliation>(`${BASE}/reconciliations/${id}/waive`, { reason });
}

/** Records money received from the employee against an item owed to the company. */
export function recordPayrollReconciliationReceipt(
  id: string,
  payload: RecordPayrollReceiptPayload,
): Promise<PayrollReconciliation> {
  return apiPost<PayrollReconciliation>(`${BASE}/reconciliations/${id}/receipt`, payload);
}

export function unwaivePayrollReconciliation(id: string): Promise<PayrollReconciliation> {
  return apiPost<PayrollReconciliation>(`${BASE}/reconciliations/${id}/unwaive`, {});
}

export function listPayrollAdjustmentTypes(): Promise<PayrollAdjustmentType[]> {
  return apiGet<PayrollAdjustmentType[]>(`${BASE}/adjustment-types`);
}

export function createPayrollAdjustmentType(
  payload: PayrollAdjustmentTypePayload,
): Promise<PayrollAdjustmentType> {
  return apiPost<PayrollAdjustmentType>(`${BASE}/adjustment-types`, payload);
}

export function updatePayrollAdjustmentType(
  id: string,
  payload: PayrollAdjustmentTypePayload,
): Promise<PayrollAdjustmentType> {
  return apiPatch<PayrollAdjustmentType>(`${BASE}/adjustment-types/${id}`, payload);
}
