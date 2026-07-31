import { Module } from '@nestjs/common';
import { HrApprovalChainService } from './application/services/hr-approval-chain.service';

/**
 * Shared HR helpers (org approval chain) used by leave, overtime, etc.
 */
@Module({
  providers: [HrApprovalChainService],
  exports: [HrApprovalChainService],
})
export class HrSharedModule {}
