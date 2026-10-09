import { Global, Module, forwardRef } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { LeavePolicyModule } from '../leave-policy/leave-policy.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { LeaveBalanceImportService } from './application/services/leave-balance-import.service';
import { LeaveBalanceService } from './application/services/leave-balance.service';
import { LeaveRequestImportService } from './application/services/leave-request-import.service';
import { LeaveService } from './application/services/leave.service';
import { LeaveBalanceImportController } from './presentation/controllers/leave-balance-import.controller';
import { LeaveRequestImportController } from './presentation/controllers/leave-request-import.controller';
import { LeaveController } from './presentation/controllers/leave.controller';

@Global()
@Module({
  imports: [
    ApprovalsModule,
    forwardRef(() => AttendanceModule),
    HrSharedModule,
    LeavePolicyModule,
    WorkScheduleModule,
  ],
  controllers: [
    LeaveRequestImportController,
    LeaveBalanceImportController,
    LeaveController,
  ],
  providers: [
    LeaveService,
    LeaveBalanceService,
    LeaveRequestImportService,
    LeaveBalanceImportService,
  ],
  exports: [LeaveService, LeaveBalanceService, LeavePolicyModule],
})
export class LeaveModule {}
