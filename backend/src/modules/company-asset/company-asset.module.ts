import { Module } from "@nestjs/common";

import { CompanyAssetImportController } from "./presentation/company-asset-import.controller";
import { CompanyAssetController } from "./presentation/company-asset.controller";
import { CompanyAssetImportService } from "./application/services/company-asset-import.service";
import { CompanyAssetService } from "./application/services/company-asset.service";
import { CompanyAssetPdfService } from "./application/services/company-asset-pdf.service";
import { DocumentsModule } from "../documents/documents.module";
import { HrSharedModule } from "../hr-shared/hr-shared.module";

@Module({
  controllers: [CompanyAssetImportController, CompanyAssetController],
  imports: [DocumentsModule, HrSharedModule],
  providers: [CompanyAssetService, CompanyAssetImportService, CompanyAssetPdfService],
  exports: [CompanyAssetService],
})
export class CompanyAssetModule {}
