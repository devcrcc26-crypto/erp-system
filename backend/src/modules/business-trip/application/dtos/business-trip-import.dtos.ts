import {
  ImportCommitResponseDto,
  ImportPreviewResponseDto,
  ImportRowPreviewDto,
  ImportRowStatus,
} from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@prisma/client';

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
  ticketClass?: FlightTicketClass;
  hostOrganization?: string;
  hostContact?: string;
  expectedOutcomes?: string;
  itinerary?: string;
  estimatedFlightCost?: number;
  estimatedAccommodationCost?: number;
  estimatedPerDiem?: number;
  estimatedOtherCost?: number;
  accommodationRequired?: boolean;
  accommodationDetails?: string;
  perDiemRequired?: boolean;
  notes?: string;
  kmAtDeparture?: number;
  kmAtReturn?: number;
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
