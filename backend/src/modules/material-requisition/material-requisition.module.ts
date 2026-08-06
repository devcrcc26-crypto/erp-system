import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { MaterialRequisitionService } from './application/services/material-requisition.service';
import { MaterialRequisitionController } from './presentation/controllers/material-requisition.controller';

/**
 * Material requisition module — warehouse stock issue requests with a fixed
 * Discipline Lead → HR Officer → General Manager approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [MaterialRequisitionController],
  providers: [MaterialRequisitionService],
  exports: [MaterialRequisitionService],
})
export class MaterialRequisitionModule {}
