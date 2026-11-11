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

export class PerDiemImportRowPreviewDto extends ImportRowPreviewDto {
  employeeId?: string;
  employeeEmail?: string;
  destinationCategory?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  linkedFlightId?: string;
  linkedBusinessTripId?: string;
}

export class PerDiemImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: PerDiemImportRowPreviewDto[];
}
