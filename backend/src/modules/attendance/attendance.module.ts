import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { OnBehalfModule } from '../on-behalf/on-behalf.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { AttendanceMatchingService } from './application/services/attendance-matching.service';
import { AttendancePreviewCache } from './application/services/attendance-preview.cache';
import { AttendanceService } from './application/services/attendance.service';
import { AttendanceController } from './presentation/attendance.controller';

/**
 * Attendance import and reporting for Deli e+ monthly exports.
 */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WorkScheduleModule),
    ApprovalsModule,
    HrSharedModule,
    OnBehalfModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceMatchingService,
    AttendancePreviewCache,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
