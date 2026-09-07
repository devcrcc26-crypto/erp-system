import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
  ImportRowStatus,
} from '../../../hr-shared/application/dtos/hr-import.dtos';
import { SupportedCurrency } from '@prisma/client';

export type {
  ImportRowStatus,
  ImportRowPreviewDto,
  ImportPreviewResponseDto,
  ImportCommitResponseDto,
};

export class ExpenseClaimImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  title?: string;
  claimDescription?: string;
  category?: string;
  description?: string;
  expenseDate?: string;
  amount?: number;
  currency?: SupportedCurrency;
}

export class ExpenseClaimImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: ExpenseClaimImportRowPreviewDto[];
}
