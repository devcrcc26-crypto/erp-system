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

export class FlightImportRowPreviewDto extends ImportRowPreviewDto {
  submitterId?: string;
  submitterEmail?: string;
  tripType?: FlightTripType;
  isInternational?: boolean;
  originCountry?: string;
  originCity?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  purpose?: string;
  ticketClass?: FlightTicketClass;
  notes?: string;
  passengerId?: string;
  passengerEmail?: string;
  passportNumber?: string;
  visaRequired?: boolean;
  visaStatus?: FlightVisaStatus | null;
}

export class FlightImportPreviewResponseDto
  implements ImportPreviewResponseDto
{
  valid!: number;
  invalid!: number;
  duplicate!: number;
  rows!: FlightImportRowPreviewDto[];
}
