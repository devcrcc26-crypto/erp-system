import {
  ImportCommitErrorDto,
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
  ImportRowStatus,
} from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  EmployeeContractType,
  SupportedCurrency,
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
  currency?: SupportedCurrency;
  basicSalary?: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  netSalary?: number;
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
