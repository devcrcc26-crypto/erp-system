import { Module } from '@nestjs/common';
import { ApprovalResolverService } from './application/services/approval-resolver.service';
import { ApprovalsService } from './application/services/approvals.service';
import { ApprovalCategoriesController } from './presentation/controllers/approval-categories.controller';
import { ApprovalRequestsController } from './presentation/controllers/approval-requests.controller';

@Module({
  controllers: [ApprovalCategoriesController, ApprovalRequestsController],
  providers: [ApprovalsService, ApprovalResolverService],
  exports: [ApprovalsService, ApprovalResolverService],
})
export class ApprovalsModule {}
