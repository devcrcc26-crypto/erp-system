export type PayrollRunStatus =
  | 'DRAFT'
  | 'REVIEWED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'GM_APPROVED'
  | 'PAID'
  | 'CANCELLED';

export type PayrollEntryFlag =
  | 'NONE'
  | 'MISSING_ATTENDANCE'
  | 'MISSING_CONTRACT'
  | 'MISSING_OVERTIME_APPROVAL'
  | 'ZERO_SALARY'
  | 'MANUAL_OVERRIDE';

export type MoneyField = number | string;

export interface PayrollRunListItem {
  id: string;
  companyId: string;
  runNumber: string;
  month: number;
  year: number;
  status: PayrollRunStatus;
  totalEmployees: number;
  totalGross: MoneyField;
  totalNetPay: MoneyField;
  totalPensionEmp: MoneyField;
  totalPensionEmr: MoneyField;
  totalTax: MoneyField;
  notes: string | null;
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
}

export interface PayrollEntryEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  department: { id: string; name: string } | null;
  engineeringDiscipline: { id: string; name: string } | null;
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
  bonusTopUp: MoneyField;
  bonusTopUpReason: string | null;
  flag: PayrollEntryFlag;
  flagNote: string | null;
  notes: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  employee: PayrollEntryEmployee;
  salaryPeriods: PayrollSalaryPeriod[];
}

export interface PayrollRunDetail {
  id: string;
  companyId: string;
  runNumber: string;
  month: number;
  year: number;
  status: PayrollRunStatus;
  totalEmployees: number;
  totalGross: MoneyField;
  totalNetPay: MoneyField;
  totalPensionEmp: MoneyField;
  totalPensionEmr: MoneyField;
  totalTax: MoneyField;
  notes: string | null;
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

export interface CreatePayrollRunPayload {
  month: number;
  year: number;
  notes?: string;
}

export interface SubmitPayrollRunPayload {
  acknowledgeFlags?: boolean;
}

export interface UpdatePayrollEntryPayload {
  bonusTopUp?: number;
  bonusTopUpReason?: string;
  notes?: string;
}
