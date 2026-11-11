import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { EmployeePerDiemRateImportService } from './application/services/employee-per-diem-rate-import.service';
import { EmployeePerDiemRateService } from './application/services/employee-per-diem-rate.service';
import { PerDiemImportService } from './application/services/per-diem-import.service';
import { PerDiemSettlementReminderService } from './application/services/per-diem-settlement-reminder.service';
import { PerDiemSettlementService } from './application/services/per-diem-settlement.service';
import { PerDiemService } from './application/services/per-diem.service';
import { EmployeePerDiemRateImportController } from './presentation/controllers/employee-per-diem-rate-import.controller';
import { EmployeePerDiemRateController } from './presentation/controllers/employee-per-diem-rate.controller';
import { PerDiemImportController } from './presentation/controllers/per-diem-import.controller';
import { PerDiemSettlementController } from './presentation/controllers/per-diem-settlement.controller';
import { PerDiemController } from './presentation/controllers/per-diem.controller';

/**
 * Per diem module - ETB employee rates, travel advances, and settlements.
 * Advances use the Discipline Lead single-tier chain; settlements use HR-only.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [
    PerDiemImportController,
    EmployeePerDiemRateImportController,
    EmployeePerDiemRateController,
    PerDiemSettlementController,
    PerDiemController,
  ],
  providers: [
    EmployeePerDiemRateService,
    EmployeePerDiemRateImportService,
    PerDiemService,
    PerDiemSettlementService,
    PerDiemSettlementReminderService,
    PerDiemImportService,
  ],
  exports: [EmployeePerDiemRateService, PerDiemService, PerDiemSettlementService],
})
export class PerDiemModule {}
