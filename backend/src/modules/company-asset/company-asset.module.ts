import { Module } from "@nestjs/common";

import { CompanyAssetController } from "./presentation/company-asset.controller";
import { CompanyAssetService } from "./application/services/company-asset.service";
import { DocumentsModule } from "../documents/documents.module";

@Module({
  controllers: [CompanyAssetController],
  imports: [DocumentsModule],
  providers: [CompanyAssetService],
  exports: [CompanyAssetService],
})
export class CompanyAssetModule {}
