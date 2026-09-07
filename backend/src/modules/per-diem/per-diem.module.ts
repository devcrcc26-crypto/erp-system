import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { EmployeePerDiemRateImportService } from './application/services/employee-per-diem-rate-import.service';
import { EmployeePerDiemRateService } from './application/services/employee-per-diem-rate.service';
import { PerDiemImportService } from './application/services/per-diem-import.service';
import { PerDiemService } from './application/services/per-diem.service';
import { EmployeePerDiemRateImportController } from './presentation/controllers/employee-per-diem-rate-import.controller';
import { EmployeePerDiemRateController } from './presentation/controllers/employee-per-diem-rate.controller';
import { PerDiemImportController } from './presentation/controllers/per-diem-import.controller';
import { PerDiemController } from './presentation/controllers/per-diem.controller';

/**
 * Per diem module — per-employee destination rates plus employee per diem
 * requests with currency conversion, optional travel linkage, and a
 * 3-tier approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [
    PerDiemImportController,
    EmployeePerDiemRateImportController,
    EmployeePerDiemRateController,
    PerDiemController,
  ],
  providers: [
    EmployeePerDiemRateService,
    EmployeePerDiemRateImportService,
    PerDiemService,
    PerDiemImportService,
  ],
  exports: [EmployeePerDiemRateService, PerDiemService],
})
export class PerDiemModule {}
