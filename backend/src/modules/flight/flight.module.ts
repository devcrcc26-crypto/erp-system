import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { FlightApplicationPdfService } from './application/services/flight-application-pdf.service';
import { FlightImportService } from './application/services/flight-import.service';
import { FlightService } from './application/services/flight.service';
import { FlightImportController } from './presentation/controllers/flight-import.controller';
import { FlightController } from './presentation/controllers/flight.controller';

/**
 * Flight application module - HR flight booking requests with
 * multi-tier approval, ticket attachment, and passenger acknowledgement.
 * NotificationService is available globally (registered in AppModule via NotificationsModule.register()).
 */
@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [FlightImportController, FlightController],
  providers: [FlightService, FlightImportService, FlightApplicationPdfService],
  exports: [FlightService],
})
export class FlightModule {}
