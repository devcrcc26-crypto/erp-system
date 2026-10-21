import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { MaterialRequisitionImportService } from './application/services/material-requisition-import.service';
import { MaterialRequisitionPdfService } from './application/services/material-requisition-pdf.service';
import { MaterialRequisitionService } from './application/services/material-requisition.service';
import { MaterialRequisitionImportController } from './presentation/controllers/material-requisition-import.controller';
import { MaterialRequisitionController } from './presentation/controllers/material-requisition.controller';

/**
 * Material requisition module - warehouse stock issue requests with a fixed
 * Discipline Lead → HR Officer → General Manager approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [
    MaterialRequisitionImportController,
    MaterialRequisitionController,
  ],
  providers: [MaterialRequisitionService, MaterialRequisitionImportService, MaterialRequisitionPdfService],
  exports: [MaterialRequisitionService],
})
export class MaterialRequisitionModule {}
