import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
  ImportRowStatus,
} from '../../../hr-shared/application/dtos/hr-import.dtos';

export type {
  ImportRowStatus,
  ImportRowPreviewDto,
  ImportPreviewResponseDto,
  ImportCommitResponseDto,
};

export class ConsumablesRequisitionImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  title?: string;
  purpose?: string;
  requiredByDate?: string;
  itemName?: string;
  itemCode?: string;
  modelSpec?: string;
  description?: string;
  quantity?: number;
  unit?: string;
}

export class ConsumablesRequisitionImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: ConsumablesRequisitionImportRowPreviewDto[];
}
