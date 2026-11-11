import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { LeaveBalanceCronService } from './application/services/leave-balance-cron.service';
import { LeaveLedgerService } from './application/services/leave-ledger.service';
import { LeavePolicyImportService } from './application/services/leave-policy-import.service';
import { LeavePolicyService } from './application/services/leave-policy.service';
import { LeavePolicyImportController } from './presentation/controllers/leave-policy-import.controller';
import { LeavePolicyController } from './presentation/controllers/leave-policy.controller';

@Module({
  imports: [AuditModule, HrSharedModule],
  controllers: [LeavePolicyImportController, LeavePolicyController],
  providers: [
    LeavePolicyService,
    LeaveLedgerService,
    LeavePolicyImportService,
    LeaveBalanceCronService,
  ],
  exports: [LeavePolicyService, LeaveLedgerService],
})
export class LeavePolicyModule {}
