import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { VehicleApplicationService } from './application/services/vehicle-application.service';
import { VehicleApplicationController } from './presentation/controllers/vehicle-application.controller';

/**
 * Vehicle application module — single-call submit with HR Officer approval
 * tier (or direct APPROVED for HR and above). Includes release flow.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [VehicleApplicationController],
  providers: [VehicleApplicationService],
  exports: [VehicleApplicationService],
})
export class VehicleApplicationModule {}
