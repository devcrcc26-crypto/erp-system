import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { PurchaseRequestService } from './application/services/purchase-request.service';
import { PurchaseRequestController } from './presentation/controllers/purchase-request.controller';

/**
 * Purchase request module — multi-item procurement requests with per-item
 * currency conversion, attachment support, and a value-tiered approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [PurchaseRequestController],
  providers: [PurchaseRequestService],
  exports: [PurchaseRequestService],
})
export class PurchaseRequestModule {}
