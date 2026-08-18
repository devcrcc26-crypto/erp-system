import { Module } from "@nestjs/common";

import { CompanyAssetController } from "./presentation/company-asset.controller";
import { CompanyAssetService } from "./application/services/company-asset.service";

@Module({
  controllers: [CompanyAssetController],
  providers: [CompanyAssetService],
  exports: [CompanyAssetService],
})
export class CompanyAssetModule {}
