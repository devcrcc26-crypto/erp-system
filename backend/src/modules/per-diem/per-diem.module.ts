import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { PerDiemRateService } from './application/services/per-diem-rate.service';
import { PerDiemService } from './application/services/per-diem.service';
import { PerDiemRateController } from './presentation/controllers/per-diem-rate.controller';
import { PerDiemController } from './presentation/controllers/per-diem.controller';

/**
 * Per diem module — HR-managed destination rates plus employee per diem
 * requests with currency conversion, optional travel linkage, and a
 * 3-tier approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [PerDiemRateController, PerDiemController],
  providers: [PerDiemRateService, PerDiemService],
  exports: [PerDiemRateService, PerDiemService],
})
export class PerDiemModule {}
