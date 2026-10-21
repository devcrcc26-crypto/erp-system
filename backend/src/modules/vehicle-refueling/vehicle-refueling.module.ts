import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { VehicleRefuelingImportService } from './application/services/vehicle-refueling-import.service';
import { VehicleRefuelingService } from './application/services/vehicle-refueling.service';
import { VehicleRefuelingPdfService } from './application/services/vehicle-refueling-pdf.service';
import { VehicleRefuelingImportController } from './presentation/controllers/vehicle-refueling-import.controller';
import { VehicleRefuelingController } from './presentation/controllers/vehicle-refueling.controller';

/**
 * Vehicle refueling module - single-call submit with HR Officer approval
 * tier (or direct APPROVED for HR and above). Includes receipt attachment and
 * the Excel import that creates DRAFT requests.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule, StorageModule],
  controllers: [VehicleRefuelingImportController, VehicleRefuelingController],
  providers: [VehicleRefuelingService, VehicleRefuelingImportService, VehicleRefuelingPdfService],
  exports: [VehicleRefuelingService],
})
export class VehicleRefuelingModule {}
