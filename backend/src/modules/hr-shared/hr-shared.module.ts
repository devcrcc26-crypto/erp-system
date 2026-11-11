import { forwardRef, Module } from '@nestjs/common';
import { OnBehalfModule } from '../on-behalf/on-behalf.module';
import { HrApprovalChainService } from './application/services/hr-approval-chain.service';
import { HrExcelImportService } from './application/import-export/hr-excel-import.service';
import { DayCoverageService } from './application/services/day-coverage.service';
import { BackdatingPolicyService } from './application/services/backdating-policy.service';
import { HrDocumentPdfService } from './application/services/hr-document-pdf.service';
import { BackdatingPolicyController } from './presentation/backdating-policy.controller';
import { DayCoverageController } from './presentation/day-coverage.controller';
import { PermissionService } from '../../shared/permissions/permission.service';

/**
 * Shared HR helpers (org approval chain, Excel import parsing, on-behalf submission)
 * used by leave, overtime, vehicle, seal and the other HR request modules.
 */
@Module({
  imports: [forwardRef(() => OnBehalfModule)],
  controllers: [BackdatingPolicyController, DayCoverageController],
  providers: [
    HrApprovalChainService,
    HrExcelImportService,
    DayCoverageService,
    BackdatingPolicyService,
    HrDocumentPdfService,
    PermissionService,
  ],
  exports: [
    HrApprovalChainService,
    HrExcelImportService,
    DayCoverageService,
    BackdatingPolicyService,
    HrDocumentPdfService,
    OnBehalfModule,
  ],
})
export class HrSharedModule {}
