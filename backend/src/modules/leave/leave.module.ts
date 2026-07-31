import { Global, Module } from '@nestjs/common';
import { APPROVAL_DECISION_LISTENER } from '../approvals/application/ports/approval-decision.listener';
import { ApprovalsModule } from '../approvals/approvals.module';
import { LeaveBalanceService } from './application/services/leave-balance.service';
import { LeaveService } from './application/services/leave.service';
import { LeaveController } from './presentation/controllers/leave.controller';

@Global()
@Module({
  imports: [ApprovalsModule],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveBalanceService,
    {
      provide: APPROVAL_DECISION_LISTENER,
      useExisting: LeaveService,
    },
  ],
  exports: [LeaveService, LeaveBalanceService, APPROVAL_DECISION_LISTENER],
})
export class LeaveModule {}
