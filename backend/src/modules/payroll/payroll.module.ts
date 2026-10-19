import { Module } from '@nestjs/common';
import { PermissionsModule } from '../../shared/permissions/permissions.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { LeavePolicyModule } from '../leave-policy/leave-policy.module';
import { PayrollController } from './presentation/controllers/payroll.controller';
import { PayrollCalculationService } from './application/services/payroll-calculation.service';
import { PayrollBankLetterService } from './application/services/payroll-bank-letter.service';
import { PayrollCompanySettingsService } from './application/services/payroll-company-settings.service';
import { PayrollExcelExportService } from './application/services/payroll-excel-export.service';
import { PayrollPayslipPdfService } from './application/services/payroll-payslip-pdf.service';
import { PayrollPayslipService } from './application/services/payroll-payslip.service';
import { PayrollRunService } from './application/services/payroll-run.service';
/**
 * NotificationService is exported by NotificationsModule (registered globally
 * in AppModule via NotificationsModule.register()).
 */
@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    WorkScheduleModule,
    AuditModule,
    LeavePolicyModule,
  ],
  controllers: [PayrollController],
  providers: [
    PayrollCalculationService,
    PayrollCompanySettingsService,
    PayrollBankLetterService,
    PayrollExcelExportService,
    PayrollPayslipPdfService,
    PayrollPayslipService,
    PayrollRunService,
  ],
  exports: [
    PayrollRunService,
    PayrollCalculationService,
    PayrollCompanySettingsService,
    PayrollBankLetterService,
    PayrollExcelExportService,
    PayrollPayslipService,
  ],
})
export class PayrollModule {}
