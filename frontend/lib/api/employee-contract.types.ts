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

export type SalaryBasis = 'GROSS' | 'NET';

export interface EmployeeContractUserSummary {
  id: string;
  firstName: string;
  lastName: string;
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
  salaryBasis?: SalaryBasis;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  basicSalary?: string | number | null;
  transportationAllowance?: string | number | null;
  monthlyBonus?: string | number | null;
  netSalary?: string | number | null;
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

/** GET /hr/employee-contracts/my/active — pay fields are never returned. */
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
}

export interface CreateEmployeeContractPayload {
  employeeId: string;
  contractType: EmployeeContractType;
  signedAt: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  salaryBasis?: SalaryBasis;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
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
  salaryBasis?: SalaryBasis;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
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
  salaryBasis: SalaryBasis;
  basicSalary: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  taxableThreshold?: number;
}

export interface SalaryPreviewResult {
  salaryBasis: SalaryBasis;
  basicSalary: number;
  transportationAllowance: number;
  monthlyBonus: number;
  netSalary: number;
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
  netPay: number;
}
