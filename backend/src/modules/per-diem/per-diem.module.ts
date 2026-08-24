import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { EmployeePerDiemRateService } from './application/services/employee-per-diem-rate.service';
import { PerDiemService } from './application/services/per-diem.service';
import { EmployeePerDiemRateController } from './presentation/controllers/employee-per-diem-rate.controller';
import { PerDiemController } from './presentation/controllers/per-diem.controller';

/**
 * Per diem module — per-employee destination rates plus employee per diem
 * requests with currency conversion, optional travel linkage, and a
 * 3-tier approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [EmployeePerDiemRateController, PerDiemController],
  providers: [EmployeePerDiemRateService, PerDiemService],
  exports: [EmployeePerDiemRateService, PerDiemService],
})
export class PerDiemModule {}
