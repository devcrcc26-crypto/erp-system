import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { ExpenseClaimImportService } from './application/services/expense-claim-import.service';
import { ExpenseClaimService } from './application/services/expense-claim.service';
import { ExpenseClaimImportController } from './presentation/controllers/expense-claim-import.controller';
import { ExpenseClaimController } from './presentation/controllers/expense-claim.controller';

/**
 * Expense claim module - multi-item reimbursement requests with per-item
 * currency conversion, receipt attachment, and a 3-tier approval chain.
 */
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [ExpenseClaimImportController, ExpenseClaimController],
  providers: [ExpenseClaimService, ExpenseClaimImportService],
  exports: [ExpenseClaimService],
})
export class ExpenseClaimModule {}
