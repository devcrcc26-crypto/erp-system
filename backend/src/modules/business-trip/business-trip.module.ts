import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { BusinessTripService } from './application/services/business-trip.service';
import { BusinessTripController } from './presentation/controllers/business-trip.controller';

/**
 * Business trip (third-country) module — international travel requests with
 * multi-tier approval, budget estimate, ticket attachment, and passenger acknowledgement.
 */
@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [BusinessTripController],
  providers: [BusinessTripService],
  exports: [BusinessTripService],
})
export class BusinessTripModule {}
