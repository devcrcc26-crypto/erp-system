import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { BusinessTripImportService } from './application/services/business-trip-import.service';
import { BusinessTripPdfService } from './application/services/business-trip-pdf.service';
import { BusinessTripService } from './application/services/business-trip.service';
import { BusinessTripImportController } from './presentation/controllers/business-trip-import.controller';
import { BusinessTripController } from './presentation/controllers/business-trip.controller';

/**
 * Business trip (third-country) module - international travel requests with
 * multi-tier approval, budget estimate, ticket attachment, and passenger acknowledgement.
 */
@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [BusinessTripImportController, BusinessTripController],
  providers: [BusinessTripService, BusinessTripImportService, BusinessTripPdfService],
  exports: [BusinessTripService],
})
export class BusinessTripModule {}
