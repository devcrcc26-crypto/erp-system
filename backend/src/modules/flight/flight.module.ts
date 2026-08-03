import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { FlightService } from './application/services/flight.service';
import { FlightController } from './presentation/controllers/flight.controller';

/**
 * Flight application module — HR flight booking requests with
 * multi-tier approval, ticket attachment, and passenger acknowledgement.
 * NotificationService is available globally (registered in AppModule via NotificationsModule.register()).
 */
@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [FlightController],
  providers: [FlightService],
  exports: [FlightService],
})
export class FlightModule {}
