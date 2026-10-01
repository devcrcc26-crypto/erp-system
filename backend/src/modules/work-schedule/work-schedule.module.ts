import { forwardRef, Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { PublicHolidayService } from './application/services/public-holiday.service';
import { WorkScheduleCronService } from './application/services/work-schedule-cron.service';
import { WorkScheduleService } from './application/services/work-schedule.service';
import { PublicHolidayController } from './presentation/public-holiday.controller';
import { WorkScheduleController } from './presentation/work-schedule.controller';

@Module({
  imports: [
    forwardRef(() => HrSharedModule),
    forwardRef(() => AttendanceModule),
  ],
  controllers: [WorkScheduleController, PublicHolidayController],
  providers: [
    WorkScheduleService,
    PublicHolidayService,
    WorkScheduleCronService,
  ],
  exports: [WorkScheduleService, PublicHolidayService],
})
export class WorkScheduleModule {}
