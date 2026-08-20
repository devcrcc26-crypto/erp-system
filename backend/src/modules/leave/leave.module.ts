import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { LeaveBalanceService } from './application/services/leave-balance.service';
import { LeavePolicyService } from './application/services/leave-policy.service';
import { LeaveService } from './application/services/leave.service';
import { LeaveController } from './presentation/controllers/leave.controller';
import { LeavePolicyController } from './presentation/controllers/leave-policy.controller';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [LeaveController, LeavePolicyController],
  providers: [LeaveService, LeaveBalanceService, LeavePolicyService],
  exports: [LeaveService, LeaveBalanceService, LeavePolicyService],
})
export class LeaveModule {}
