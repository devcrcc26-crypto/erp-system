export type PayrollRunStatus =
  | 'DRAFT'
  | 'REVIEWED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'GM_APPROVED'
  | 'PAID'
  | 'CANCELLED'
  | 'SUPERSEDED';

export type PayrollRunType = 'REGULAR' | 'CORRECTION';

export type PayrollEntryFlag =
  | 'NONE'
  | 'MISSING_ATTENDANCE'
  | 'MISSING_CONTRACT'
  | 'MISSING_OVERTIME_APPROVAL'
  | 'ZERO_SALARY'
  | 'MANUAL_OVERRIDE'
  | 'LEAVER_FINAL_MONTH'
  | 'LOGIN_DISABLED_STILL_EMPLOYED'
  | 'INACTIVE_IN_MONTH'
  | 'CONTRACT_ENDED_NOT_RENEWED';

export type MoneyField = number | string;

export interface PayrollRunListItem {
  id: string;
  companyId: string;
  runNumber: string;
  month: number;
  year: number;
  type?: PayrollRunType;
  originalRunId?: string | null;
  status: PayrollRunStatus;
  totalEmployees: number;
  totalGross: MoneyField;
  totalNetPay: MoneyField;
  totalNetBonus: MoneyField;
  totalPensionEmp: MoneyField;
  totalPensionEmr: MoneyField;
  totalTax: MoneyField;
  notes: string | null;
  /** False: this run ignores attendance (only approved leave reduces pay). */
  considerAttendance?: boolean;
  attendanceSnapshotStale?: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { entries: number };
  flaggedCount: number;
}

export interface PayrollSalaryPeriod {
  id: string;
  entryId: string;
  contractId: string;
  periodStart: string;
  periodEnd: string;
  days: MoneyField;
  basicSalary: MoneyField;
  earnedSalary: MoneyField;
  normalOtHours?: MoneyField;
  eveningOtHours?: MoneyField;
  sundayOtHours?: MoneyField;
  holidayOtHours?: MoneyField;
  normalOtPay?: MoneyField;
  eveningOtPay?: MoneyField;
  sundayOtPay?: MoneyField;
  holidayOtPay?: MoneyField;
  totalOtPay?: MoneyField;
  contract?: {
    contractNumber: string | null;
    transportationAllowance: MoneyField;
    monthlyBonus: MoneyField;
  } | null;
}

export interface PayrollFreelancerOption {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  chineseName: string | null;
  employeeId: string | null;
}

export interface PayrollEntryEmployee {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
  employeeId: string | null;
  employeeType?: 'PERMANENT' | 'CONTRACT' | 'TEMPORARY' | 'FREELANCER' | null;
  department: { id: string; name: string } | null;
  engineeringDiscipline: { id: string; name: string } | null;
}

export interface PayrollEntryPayslip {
  id: string;
  generatedAt: string | null;
  releasedAt: string | null;
  downloadedAt: string | null;
}

export interface PayrollEntryDetail {
  id: string;
  runId: string;
  employeeId: string;
  contractId: string | null;
  attendanceRecordId: string | null;
  overtimeSheetId: string | null;
  scheduledDays: MoneyField;
  presentDays: MoneyField;
  absentDays: MoneyField;
  employedDays: MoneyField;
  payrollDays: MoneyField;
  basicSalary: MoneyField;
  transportAllowance: MoneyField;
  monthlyBonus: MoneyField;
  contractNetBonus: MoneyField;
  earnedSalary: MoneyField;
  normalOtHours: MoneyField;
  eveningOtHours: MoneyField;
  sundayOtHours: MoneyField;
  holidayOtHours: MoneyField;
  normalOtPay: MoneyField;
  eveningOtPay: MoneyField;
  sundayOtPay: MoneyField;
  holidayOtPay: MoneyField;
  totalOtPay: MoneyField;
  taxableTransport: MoneyField;
  nonTaxableTransport: MoneyField;
  grossIncome: MoneyField;
  taxableIncome: MoneyField;
  pensionEmployee: MoneyField;
  pensionEmployer: MoneyField;
  incomeTax: MoneyField;
  totalDeductions: MoneyField;
  netPay: MoneyField;
  originalAmount?: MoneyField | null;
  correctedAmount?: MoneyField | null;
  deltaAmount?: MoneyField | null;
  bonusTopUp: MoneyField;
  bonusTopUpReason: string | null;
  netTopUp: MoneyField;
  netTopUpReason: string | null;
  flag: PayrollEntryFlag;
  flagNote: string | null;
  notes: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  employee: PayrollEntryEmployee;
  salaryPeriods: PayrollSalaryPeriod[];
  payslip?: PayrollEntryPayslip | null;
  /** Only returned to HR (payroll.edit). */
  hasOverride?: boolean;
}

export interface UpdatePayrollEntryDaysPayload {
  payrollDays: number;
  /** When set, overrides paid days for this salary period only (multi-contract months). */
  periodId?: string;
  reason?: string;
}

export interface PayrollEntryAuditRecord {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  changedAt: string;
  changedBy: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    chineseName: string | null;
  };
}

export interface PayslipGenerateResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface PayslipReleaseResult {
  released: number;
  alreadyReleased: number;
  notified: number;
}

export interface EmployeePayslip {
  id: string;
  runId: string;
  runNumber: string;
  month: number;
  year: number;
  netPay: MoneyField;
  releasedAt: string | null;
  downloadedAt: string | null;
  downloaded: boolean;
  released: boolean;
  employeeName: string;
  employeeCode: string | null;
  department: string | null;
  discipline: string | null;
  bankName: string | null;
  bankAccountMasked: string | null;
  paidDays: MoneyField;
  basicSalary: MoneyField;
  earnedSalary: MoneyField;
  normalOtHours: MoneyField;
  eveningOtHours: MoneyField;
  sundayOtHours: MoneyField;
  holidayOtHours: MoneyField;
  normalOtPay: MoneyField;
  eveningOtPay: MoneyField;
  sundayOtPay: MoneyField;
  holidayOtPay: MoneyField;
  transportAllowance: MoneyField;
  monthlyBonus: MoneyField;
  bonusTopUp: MoneyField;
  bonusTopUpReason: string | null;
  contractNetBonus: MoneyField;
  netTopUp: MoneyField;
  netTopUpReason: string | null;
  grossIncome: MoneyField;
  pensionApplicable: boolean;
  pensionEmployee: MoneyField;
  pensionEmployer: MoneyField;
  incomeTax: MoneyField;
  totalDeductions: MoneyField;
}

export interface PayrollRunDetail {
  id: string;
  companyId: string;
  runNumber: string;
  month: number;
  year: number;
  type?: PayrollRunType;
  originalRunId?: string | null;
  originalRun?: {
    id: string;
    runNumber: string;
    month: number;
    year: number;
    status: PayrollRunStatus;
    type: PayrollRunType;
  } | null;
  status: PayrollRunStatus;
  totalEmployees: number;
  totalGross: MoneyField;
  totalNetPay: MoneyField;
  totalNetBonus: MoneyField;
  totalPensionEmp: MoneyField;
  totalPensionEmr: MoneyField;
  totalTax: MoneyField;
  notes: string | null;
  /** False: this run ignores attendance (only approved leave reduces pay). */
  considerAttendance?: boolean;
  attendanceSnapshotStale?: boolean;
  policyReviewRequired?: boolean;
  policyReviewNote?: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  gmApprovedAt: string | null;
  gmApprovedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** People on the approval steps (names come with the run). */
  creator?: PayrollRunPerson | null;
  submitter?: PayrollRunPerson | null;
  approver?: PayrollRunPerson | null;
  gmApprover?: PayrollRunPerson | null;
  payer?: PayrollRunPerson | null;
  entries: PayrollEntryDetail[];
}

export interface PayrollRunPerson {
  id: string;
  firstName: string;
  lastName: string;
  chineseName: string | null;
}

export interface CreatePayrollCorrectionPayload {
  note?: string;
}

export interface CreatePayrollRunPayload {
  month: number;
  year: number;
  notes?: string;
  /** Omit to use the company default. */
  considerAttendance?: boolean;
}

/** Run settings on a DRAFT / REVIEWED run (changing attendance recalculates it). */
export interface UpdatePayrollRunPayload {
  considerAttendance?: boolean;
  notes?: string;
}

export interface SubmitPayrollRunPayload {
  acknowledgeFlags?: boolean;
  /** Number of employment-flagged employees reviewed (required when there are any). */
  confirmEmploymentReview?: number;
}

export interface ApprovePayrollRunPayload {
  /** Number of employment-flagged employees reviewed (required when there are any). */
  confirmEmploymentReview?: number;
}

export type EmploymentReviewFlag =
  | 'CONTRACT_ENDED_NOT_RENEWED'
  | 'LOGIN_DISABLED_STILL_EMPLOYED'
  | 'LEAVER_FINAL_MONTH'
  | 'INACTIVE_IN_MONTH';

/** An entry HR must review before submitting / approving the run. */
export interface PayrollEmploymentReviewEntry {
  entryId: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  flag: EmploymentReviewFlag;
  flagNote: string | null;
}

export interface UpdatePayrollEntryPayload {
  bonusTopUp?: number;
  bonusTopUpReason?: string;
  netTopUp?: number;
  netTopUpReason?: string;
  notes?: string;
}

/** Company letterhead / tax-form / bank-letter settings (module = payroll). */
export interface PayrollCompanySettings {
  orgNameTax: string;
  tin: string;
  taxAccountNo: string;
  region: string;
  zone: string;
  woreda: string;
  kebele: string;
  houseNo: string;
  phone: string;
  fax: string;
  taxCollectorOffice: string;
  salaryBankName: string;
  bankBranch: string;
  companyAccountNumber: string;
  bankLetterRefPrefix: string;
  /** New runs consider attendance unless turned off for the run. */
  considerAttendanceDefault: boolean;
}

export type UpdatePayrollCompanySettingsPayload = Partial<PayrollCompanySettings>;


/** Payroll OT bucket (same four as the entry's *_ot_hours / *_ot_pay). */
export type PayrollOtCategory = 'NORMAL' | 'EVENING' | 'SUNDAY' | 'HOLIDAY';

interface PayrollOtPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Manual (paper-based) OT hours on a run for one employee, contract and category. */
export interface PayrollOtAdjustment {
  id: string;
  payrollRunId: string;
  employeeId: string;
  contractId: string;
  employee: PayrollOtPerson & { employeeId: string | null };
  otCategory: PayrollOtCategory;
  /** Hours HR entered (negative subtracts). */
  hours: number;
  /** Hours actually added (capped so a category never goes below zero). */
  appliedHours: number;
  /** OT pay those hours added. */
  amount: number;
  note: string | null;
  createdBy: PayrollOtPerson;
  createdAt: string;
  updatedBy: PayrollOtPerson;
  updatedAt: string;
}

export interface PayrollOtCategoryBreakdown {
  category: PayrollOtCategory;
  systemHours: number;
  systemPay: number;
  manualHours: number;
  manualPay: number;
  totalHours: number;
  totalPay: number;
}

/** One salary-period contract that can receive paper OT. */
export interface PayrollOtContractOption {
  contractId: string;
  contractNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  basicSalary: number;
  categories: PayrollOtCategoryBreakdown[];
  rates: Record<PayrollOtCategory, number>;
}

/** System OT vs manual OT for one employee on one run. */
export interface PayrollOtBreakdown {
  runId: string;
  runStatus: string;
  editable: boolean;
  employeeId: string;
  entryId: string | null;
  overtimeSheetId: string | null;
  paidDays: number;
  /** Month-end / last period — default selection in the UI. */
  defaultContractId: string | null;
  contracts: PayrollOtContractOption[];
  /** Employee-level roll-up across all contracts. */
  categories: PayrollOtCategoryBreakdown[];
  totals: { systemPay: number; manualPay: number; totalPay: number };
  adjustments: PayrollOtAdjustment[];
  /** Rates for the default contract (live preview fallback). */
  rates?: Record<PayrollOtCategory, number>;
  /** After a save: the repriced entry (patched into the run without a reload). */
  entry?: Partial<PayrollEntryDetail> & { id: string };
}

export interface UpsertPayrollOtAdjustmentPayload {
  employeeId: string;
  contractId: string;
  otCategory: PayrollOtCategory;
  hours: number;
  note: string;
}

/** Bulk replace of manual OT for one contract on an employee (one reprice). */
export interface ReplacePayrollOtAdjustmentsPayload {
  employeeId: string;
  contractId: string;
  /** Non-zero categories only; empty clears this contract’s manual OT. */
  items: Array<{ otCategory: PayrollOtCategory; hours: number }>;
  note?: string;
}
