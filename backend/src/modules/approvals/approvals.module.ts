import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalDecisionRegistry } from './application/services/approval-decision-registry.service';
import { ApprovalResolverService } from './application/services/approval-resolver.service';
import { ApprovalsService } from './application/services/approvals.service';
import { ApprovalCategoriesController } from './presentation/controllers/approval-categories.controller';
import { ApprovalRequestsController } from './presentation/controllers/approval-requests.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [ApprovalCategoriesController, ApprovalRequestsController],
  providers: [
    ApprovalsService,
    ApprovalResolverService,
    ApprovalDecisionRegistry,
  ],
  exports: [
    ApprovalsService,
    ApprovalResolverService,
    ApprovalDecisionRegistry,
  ],
})
export class ApprovalsModule {}
