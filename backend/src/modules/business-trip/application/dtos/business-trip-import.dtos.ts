import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
  ImportRowStatus,
} from '../../../hr-shared/application/dtos/hr-import.dtos';
import { FlightTripType, FlightVisaStatus } from '@prisma/client';

export type {
  ImportRowStatus,
  ImportRowPreviewDto,
  ImportPreviewResponseDto,
  ImportCommitResponseDto,
};

export class BusinessTripImportRowPreviewDto extends ImportRowPreviewDto {
  submitterId?: string;
  submitterEmail?: string;
  tripType?: FlightTripType;
  originCountry?: string;
  originCity?: string;
  destinationCountry?: string;
  destinationCity?: string;
  departureDate?: string;
  returnDate?: string;
  purpose?: string;
  hostOrganization?: string;
  hostContactName?: string;
  hostContactPhone?: string;
  hostContactEmail?: string;
  expectedOutcomes?: string;
  itinerary?: string;
  estimatedAccommodationCost?: number;
  estimatedPerDiem?: number;
  estimatedOtherCost?: number;
  notes?: string;
  passengerId?: string;
  passengerEmail?: string;
  passportNumber?: string;
  visaRequired?: boolean;
  visaStatus?: FlightVisaStatus | null;
}

export class BusinessTripImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: BusinessTripImportRowPreviewDto[];
}
