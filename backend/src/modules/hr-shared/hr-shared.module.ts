import { Module } from '@nestjs/common';
import { HrApprovalChainService } from './application/services/hr-approval-chain.service';
import { HrExcelImportService } from './application/import-export/hr-excel-import.service';

/**
 * Shared HR helpers (org approval chain, Excel import parsing) used by leave,
 * overtime, vehicle, seal and the other HR request modules.
 */
@Module({
  providers: [HrApprovalChainService, HrExcelImportService],
  exports: [HrApprovalChainService, HrExcelImportService],
})
export class HrSharedModule {}
