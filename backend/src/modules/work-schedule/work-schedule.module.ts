import { Module } from '@nestjs/common';
import { PublicHolidayService } from './application/services/public-holiday.service';
import { WorkScheduleCronService } from './application/services/work-schedule-cron.service';
import { WorkScheduleService } from './application/services/work-schedule.service';
import { PublicHolidayController } from './presentation/public-holiday.controller';
import { WorkScheduleController } from './presentation/work-schedule.controller';

@Module({
  controllers: [WorkScheduleController, PublicHolidayController],
  providers: [
    WorkScheduleService,
    PublicHolidayService,
    WorkScheduleCronService,
  ],
  exports: [WorkScheduleService, PublicHolidayService],
})
export class WorkScheduleModule {}
