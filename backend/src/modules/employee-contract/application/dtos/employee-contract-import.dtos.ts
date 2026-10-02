import {
  ImportCommitErrorDto,
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
  ImportRowStatus,
} from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  EmployeeContractType,
  SalaryBasis,
} from '@prisma/client';

export type {
  ImportRowStatus,
  ImportRowPreviewDto,
  ImportPreviewResponseDto,
  ImportCommitErrorDto,
  ImportCommitResponseDto,
};

export class EmployeeContractImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  contractType?: EmployeeContractType;
  signedAt?: string;
  startDate?: string;
  endDate?: string;
  salaryBasis?: SalaryBasis;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  probationEndDate?: string;
  governedBy?: string;
  notes?: string;
}

export class EmployeeContractImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: EmployeeContractImportRowPreviewDto[];
}
