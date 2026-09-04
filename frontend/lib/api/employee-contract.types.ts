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

export interface CreateEmployeeContractPayload {
  employeeId: string;
  contractType: EmployeeContractType;
  signedAt: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  currency?: EmployeeContractCurrency;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
  probationEndDate?: string;
  governedBy?: string;
}

export interface UpdateEmployeeContractPayload {
  contractType?: EmployeeContractType;
  signedAt?: string;
  startDate?: string;
  endDate?: string | null;
  notes?: string;
  currency?: EmployeeContractCurrency;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
  probationEndDate?: string | null;
  governedBy?: string;
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
