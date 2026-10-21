import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { ConsumablesRequisitionImportService } from './application/services/consumables-requisition-import.service';
import { ConsumablesRequisitionPdfService } from './application/services/consumables-requisition-pdf.service';
import { ConsumablesRequisitionService } from './application/services/consumables-requisition.service';
import { ConsumablesRequisitionImportController } from './presentation/controllers/consumables-requisition-import.controller';
import { ConsumablesRequisitionController } from './presentation/controllers/consumables-requisition.controller';

/**
 * Consumables requisition module - low-value consumable stock requests with a
 * single HR Officer approval tier (or direct APPROVED for HR and above).
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [
    ConsumablesRequisitionImportController,
    ConsumablesRequisitionController,
  ],
  providers: [
    ConsumablesRequisitionService,
    ConsumablesRequisitionImportService,
    ConsumablesRequisitionPdfService,
  ],
  exports: [ConsumablesRequisitionService],
})
export class ConsumablesRequisitionModule {}
