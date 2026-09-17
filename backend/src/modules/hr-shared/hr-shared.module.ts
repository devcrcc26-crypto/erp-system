import { forwardRef, Module } from '@nestjs/common';
import { OnBehalfModule } from '../on-behalf/on-behalf.module';
import { HrApprovalChainService } from './application/services/hr-approval-chain.service';
import { HrExcelImportService } from './application/import-export/hr-excel-import.service';

/**
 * Shared HR helpers (org approval chain, Excel import parsing, on-behalf submission)
 * used by leave, overtime, vehicle, seal and the other HR request modules.
 */
@Module({
  imports: [forwardRef(() => OnBehalfModule)],
  providers: [HrApprovalChainService, HrExcelImportService],
  exports: [HrApprovalChainService, HrExcelImportService, OnBehalfModule],
})
export class HrSharedModule {}
