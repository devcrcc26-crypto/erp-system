import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { OvertimeImportService } from './application/services/overtime-import.service';
import { OvertimeEntryService } from './application/services/overtime-entry.service';
import { OvertimeService } from './application/services/overtime.service';
import { OvertimeImportController } from './presentation/controllers/overtime-import.controller';
import { OvertimeController } from './presentation/controllers/overtime.controller';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule, WorkScheduleModule],
  controllers: [OvertimeImportController, OvertimeController],
  providers: [OvertimeService, OvertimeImportService, OvertimeEntryService],
  exports: [OvertimeService, OvertimeEntryService],
})
export class OvertimeModule {}
