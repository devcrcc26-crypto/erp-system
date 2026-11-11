import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { VehicleApplicationImportService } from './application/services/vehicle-application-import.service';
import { VehicleApplicationService } from './application/services/vehicle-application.service';
import { VehicleApplicationPdfService } from './application/services/vehicle-application-pdf.service';
import { VehicleApplicationImportController } from './presentation/controllers/vehicle-application-import.controller';
import { VehicleApplicationController } from './presentation/controllers/vehicle-application.controller';

/**
 * Vehicle application module - single-call submit with HR Officer approval
 * tier (or direct APPROVED for HR and above). Includes release flow and the
 * Excel import that creates DRAFT applications.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [VehicleApplicationImportController, VehicleApplicationController],
  providers: [VehicleApplicationService, VehicleApplicationImportService, VehicleApplicationPdfService],
  exports: [VehicleApplicationService],
})
export class VehicleApplicationModule {}
