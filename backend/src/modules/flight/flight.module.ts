import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { FlightService } from './application/services/flight.service';
import { FlightController } from './presentation/controllers/flight.controller';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [FlightController],
  providers: [FlightService],
  exports: [FlightService],
})
export class FlightModule {}
