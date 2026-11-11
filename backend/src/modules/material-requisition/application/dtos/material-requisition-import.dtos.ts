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

export class MaterialRequisitionImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  title?: string;
  purpose?: string;
  warehouseLocation?: string;
  requiredByDate?: string;
  projectId?: string;
  itemName?: string;
  itemCode?: string;
  description?: string;
  quantity?: number;
  unit?: string;
}

export class MaterialRequisitionImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: MaterialRequisitionImportRowPreviewDto[];
}
