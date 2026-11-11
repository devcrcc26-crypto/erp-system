import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { InspectionRepairImportController } from './presentation/controllers/inspection-repair-import.controller';
import { InspectionRepairController } from './presentation/controllers/inspection-repair.controller';
import { InspectionRepairImportService } from './application/services/inspection-repair-import.service';
import { InspectionRepairService } from './application/services/inspection-repair.service';
import { InspectionRepairPdfService } from './application/services/inspection-repair-pdf.service';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [InspectionRepairImportController, InspectionRepairController],
  providers: [InspectionRepairService, InspectionRepairImportService, InspectionRepairPdfService],
  exports: [InspectionRepairService],
})
export class InspectionRepairModule {}
