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
  entries: PayrollEntryDetail[];
}

export interface CreatePayrollCorrectionPayload {
  note?: string;
}

export interface CreatePayrollRunPayload {
  month: number;
  year: number;
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
}

export type UpdatePayrollCompanySettingsPayload = Partial<PayrollCompanySettings>;

