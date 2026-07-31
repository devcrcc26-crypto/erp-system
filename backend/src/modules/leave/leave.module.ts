import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { LeaveBalanceService } from './application/services/leave-balance.service';
import { LeaveService } from './application/services/leave.service';
import { LeaveController } from './presentation/controllers/leave.controller';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveBalanceService],
  exports: [LeaveService, LeaveBalanceService],
})
export class LeaveModule {}
