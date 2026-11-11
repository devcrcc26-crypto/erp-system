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

export class PurchaseRequestImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  title?: string;
  justification?: string;
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  requiredByDate?: string;
  itemName?: string;
  modelSpec?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  currency?: SupportedCurrency;
}

export class PurchaseRequestImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: PurchaseRequestImportRowPreviewDto[];
}
