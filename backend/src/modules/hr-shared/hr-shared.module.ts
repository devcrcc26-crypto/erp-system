import { forwardRef, Module } from '@nestjs/common';
import { OnBehalfModule } from '../on-behalf/on-behalf.module';
import { HrApprovalChainService } from './application/services/hr-approval-chain.service';
import { HrExcelImportService } from './application/import-export/hr-excel-import.service';
import { DayCoverageService } from './application/services/day-coverage.service';

/**
 * Shared HR helpers (org approval chain, Excel import parsing, on-behalf submission)
 * used by leave, overtime, vehicle, seal and the other HR request modules.
 */
@Module({
  imports: [forwardRef(() => OnBehalfModule)],
  providers: [HrApprovalChainService, HrExcelImportService, DayCoverageService],
  exports: [
    HrApprovalChainService,
    HrExcelImportService,
    DayCoverageService,
    OnBehalfModule,
  ],
})
export class HrSharedModule {}
