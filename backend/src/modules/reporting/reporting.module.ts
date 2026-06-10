import { Module } from '@nestjs/common';
import { DashboardService } from './application/services/dashboard.service';
import { ReportExecutorService } from './application/services/report-executor.service';
import { ReportingService } from './application/services/reporting.service';
import { DashboardController } from './presentation/controllers/dashboard.controller';
import { ReportsController } from './presentation/controllers/reports.controller';

@Module({
  controllers: [ReportsController, DashboardController],
  providers: [ReportingService, ReportExecutorService, DashboardService],
  exports: [ReportingService, DashboardService],
})
export class ReportingModule {}
