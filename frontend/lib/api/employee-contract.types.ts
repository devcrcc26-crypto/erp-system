export type EmployeeContractStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'TERMINATED'
  | 'EXPIRED';

export type EmployeeContractType =
  | 'FIXED_TERM'
  | 'OPEN_ENDED'
  | 'PROBATION'
  | 'RENEWAL';

export type EmployeeContractCurrency = 'ETB' | 'USD' | 'CNY';

export interface EmployeeContractUserSummary {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
  email?: string | null;
}

export interface EmployeeContractDocument {
  id: string;
  name: string;
  fileKey: string;
  fileType: string;
  fileSizeBytes: number;
}

export interface EmployeeContractListItem {
  id: string;
  companyId: string;
  contractNumber: string;
  employeeId: string;
  contractType: EmployeeContractType;
  status: EmployeeContractStatus;
  signedAt: string;
  startDate: string;
  endDate?: string;
  terminatedAt?: string | null;
  notes?: string | null;
  currency?: EmployeeContractCurrency;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  basicSalary?: string | number | null;
  transportationAllowance?: string | number | null;
  monthlyBonus?: string | number | null;
  monthlyNetBonus?: string | number | null;
  probationEndDate?: string | null;
  governedBy?: string | null;
  lastWarnedAt?: string | null;
  attachmentFolderId?: string | null;
  terminationReason?: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  employee?: EmployeeContractUserSummary;
}

export interface EmployeeContractDetail extends EmployeeContractListItem {
  creator?: EmployeeContractUserSummary;
  attachmentFolder?: {
    id: string;
    documents: EmployeeContractDocument[];
  } | null;
}

/** GET /hr/employee-contracts/my/active — own contract including pay amounts. */
export interface MyActiveContract {
  id: string;
  contractNumber: string;
  contractType: EmployeeContractType;
  status: EmployeeContractStatus;
  signedAt: string;
  startDate: string;
  endDate: string | null;
  probationEndDate: string | null;
  governedBy: string | null;
  currency: EmployeeContractCurrency;
  basicSalary: number | null;
  transportationAllowance: number | null;
  monthlyBonus: number | null;
  monthlyNetBonus: number | null;
  pensionApplicable: boolean;
  taxApplicable: boolean;
}

export interface CreateEmployeeContractPayload {
  employeeId: string;
  contractType: EmployeeContractType;
  signedAt: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  monthlyNetBonus?: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  probationEndDate?: string;
  governedBy?: string;
  files?: File[];
}

export interface UpdateEmployeeContractPayload {
  contractType?: EmployeeContractType;
  signedAt?: string;
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  monthlyNetBonus?: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  probationEndDate?: string | null;
  governedBy?: string | null;
}

export interface TerminateEmployeeContractPayload {
  terminatedAt?: string;
  terminationReason: string;
}

export interface ListEmployeeContractsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeContractStatus | EmployeeContractStatus[];
  employeeId?: string;
  contractType?: EmployeeContractType;
  expiringSoon?: boolean;
}

export interface SalaryPreviewRequest {
  basicSalary: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  monthlyNetBonus?: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  taxableThreshold?: number;
}

export interface RenewalLeaveYear {
  label: number;
  start: string;
  end: string;
}

/** Annual leave effect of a new contract (GET /hr/employee-contracts/renewal-preview). */
export interface RenewalLeavePreview {
  isRenewal: boolean;
  excluded: boolean;
  alreadyOpen: boolean;
  currentYear: RenewalLeaveYear;
  currentRemaining: number;
  carryForward: number;
  expired: number;
  newYear: RenewalLeaveYear;
  serviceYears: number;
  newEntitlement: number;
  projectedOpeningBalance: number;
}

export interface SalaryPreviewResult {
  basicSalary: number;
  transportationAllowance: number;
  monthlyBonus: number;
  monthlyNetBonus: number;
  pensionApplicable: boolean;
  taxApplicable: boolean;
  taxableThreshold: number;
  earnedSalary: number;
  taxableIncome: number;
  incomeTax: number;
  pensionEmployee: number;
  pensionEmployer: number;
  grossIncome: number;
  totalDeductions: number;
  totalNetBonus: number;
  netPay: number;
}

export interface BonusFromNetRequest {
  basicSalary: number;
  transportationAllowance?: number;
  targetNet: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  taxableThreshold?: number;
}

export interface BonusFromNetResult {
  monthlyBonus: number;
}
