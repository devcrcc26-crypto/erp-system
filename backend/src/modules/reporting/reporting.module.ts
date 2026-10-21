import { Module } from '@nestjs/common';
import { DashboardService } from './application/services/dashboard.service';
import { HrReportService } from './application/services/hr-report.service';
import { ReportExecutorService } from './application/services/report-executor.service';
import { ReportingService } from './application/services/reporting.service';
import { SystemReportPdfService } from './application/services/system-report-pdf.service';
import { DashboardController } from './presentation/controllers/dashboard.controller';
import { HrReportController } from './presentation/controllers/hr-report.controller';
import { ReportsController } from './presentation/controllers/reports.controller';

@Module({
  controllers: [ReportsController, DashboardController, HrReportController],
  providers: [
    ReportingService,
    ReportExecutorService,
    DashboardService,
    HrReportService,
    SystemReportPdfService,
  ],
  exports: [ReportingService, DashboardService, HrReportService],
})
export class ReportingModule {}
