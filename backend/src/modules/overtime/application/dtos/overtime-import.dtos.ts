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

export class OvertimeImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  year?: number;
  month?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  isHoliday?: boolean;
  taskDescription?: string;
}

export class OvertimeImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  warnings?: number;
  rows!: OvertimeImportRowPreviewDto[];
}
