import { forwardRef, Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { PublicHolidayService } from './application/services/public-holiday.service';
import { WorkScheduleCronService } from './application/services/work-schedule-cron.service';
import { WorkScheduleService } from './application/services/work-schedule.service';
import { PublicHolidayController } from './presentation/public-holiday.controller';
import { WorkFromHomeDayController } from './presentation/work-from-home-day.controller';
import { WorkFromHomeDayService } from './application/services/work-from-home-day.service';
import { WorkScheduleController } from './presentation/work-schedule.controller';

@Module({
  imports: [
    forwardRef(() => HrSharedModule),
    forwardRef(() => AttendanceModule),
  ],
  controllers: [
    WorkScheduleController,
    PublicHolidayController,
    WorkFromHomeDayController,
  ],
  providers: [
    WorkScheduleService,
    PublicHolidayService,
    WorkFromHomeDayService,
    WorkScheduleCronService,
  ],
  exports: [WorkScheduleService, PublicHolidayService, WorkFromHomeDayService],
})
export class WorkScheduleModule {}
