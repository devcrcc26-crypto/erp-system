import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { VehicleRefuelingService } from './application/services/vehicle-refueling.service';
import { VehicleRefuelingController } from './presentation/controllers/vehicle-refueling.controller';

/**
 * Vehicle refueling module — single-call submit with HR Officer approval
 * tier (or direct APPROVED for HR and above). Includes receipt attachment.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule, StorageModule],
  controllers: [VehicleRefuelingController],
  providers: [VehicleRefuelingService],
  exports: [VehicleRefuelingService],
})
export class VehicleRefuelingModule {}
