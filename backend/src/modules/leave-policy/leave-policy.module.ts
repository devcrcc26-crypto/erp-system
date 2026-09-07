import { Module } from '@nestjs/common';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { LeaveBalanceCronService } from './application/services/leave-balance-cron.service';
import { LeavePolicyImportService } from './application/services/leave-policy-import.service';
import { LeavePolicyService } from './application/services/leave-policy.service';
import { LeavePolicyImportController } from './presentation/controllers/leave-policy-import.controller';
import { LeavePolicyController } from './presentation/controllers/leave-policy.controller';

@Module({
  imports: [HrSharedModule],
  controllers: [LeavePolicyImportController, LeavePolicyController],
  providers: [
    LeavePolicyService,
    LeavePolicyImportService,
    LeaveBalanceCronService,
  ],
  exports: [LeavePolicyService],
})
export class LeavePolicyModule {}
