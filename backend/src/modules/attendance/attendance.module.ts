import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { AttendanceMatchingService } from './application/services/attendance-matching.service';
import { AttendancePreviewCache } from './application/services/attendance-preview.cache';
import { AttendanceService } from './application/services/attendance.service';
import { AttendanceController } from './presentation/attendance.controller';

/**
 * Attendance import and reporting for Deli e+ monthly exports.
 */
@Module({
  imports: [PrismaModule, WorkScheduleModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceMatchingService,
    AttendancePreviewCache,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
