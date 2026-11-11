import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { AssetRequestService } from './application/services/asset-request.service';
import { AssetRequestController } from './presentation/asset-request.controller';

@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [AssetRequestController],
  providers: [AssetRequestService],
  exports: [AssetRequestService],
})
export class AssetRequestModule {}
