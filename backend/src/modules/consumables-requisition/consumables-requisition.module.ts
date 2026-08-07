import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { ConsumablesRequisitionService } from './application/services/consumables-requisition.service';
import { ConsumablesRequisitionController } from './presentation/controllers/consumables-requisition.controller';

/**
 * Consumables requisition module — low-value consumable stock requests with a
 * single HR Officer approval tier (or direct APPROVED for HR and above).
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [ConsumablesRequisitionController],
  providers: [ConsumablesRequisitionService],
  exports: [ConsumablesRequisitionService],
})
export class ConsumablesRequisitionModule {}
