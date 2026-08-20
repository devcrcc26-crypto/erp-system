import { Module } from '@nestjs/common';
import { LeaveBalanceCronService } from './application/services/leave-balance-cron.service';
import { LeavePolicyService } from './application/services/leave-policy.service';
import { LeavePolicyController } from './presentation/controllers/leave-policy.controller';

@Module({
  controllers: [LeavePolicyController],
  providers: [LeavePolicyService, LeaveBalanceCronService],
  exports: [LeavePolicyService],
})
export class LeavePolicyModule {}
