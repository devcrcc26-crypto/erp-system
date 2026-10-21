import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { PurchaseRequestImportService } from './application/services/purchase-request-import.service';
import { PurchaseRequestPdfService } from './application/services/purchase-request-pdf.service';
import { PurchaseRequestService } from './application/services/purchase-request.service';
import { PurchaseRequestImportController } from './presentation/controllers/purchase-request-import.controller';
import { PurchaseRequestController } from './presentation/controllers/purchase-request.controller';

/**
 * Purchase request module - multi-item procurement requests with per-item
 * ETB line pricing, attachment support, and a value-tiered approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [PurchaseRequestImportController, PurchaseRequestController],
  providers: [PurchaseRequestService, PurchaseRequestImportService, PurchaseRequestPdfService],
  exports: [PurchaseRequestService],
})
export class PurchaseRequestModule {}
