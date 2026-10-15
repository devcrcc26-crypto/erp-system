import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalDecisionRegistry } from './application/services/approval-decision-registry.service';
import { ApprovalReassignmentService } from './application/services/approval-reassignment.service';
import { ApprovalResolverService } from './application/services/approval-resolver.service';
import { ApprovalsService } from './application/services/approvals.service';
import { ApprovalCategoriesController } from './presentation/controllers/approval-categories.controller';
import { ApprovalReassignmentController } from './presentation/controllers/approval-reassignment.controller';
import { ApprovalRequestsController } from './presentation/controllers/approval-requests.controller';

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [
    ApprovalCategoriesController,
    ApprovalRequestsController,
    ApprovalReassignmentController,
  ],
  providers: [
    ApprovalsService,
    ApprovalResolverService,
    ApprovalDecisionRegistry,
    ApprovalReassignmentService,
  ],
  exports: [
    ApprovalsService,
    ApprovalResolverService,
    ApprovalDecisionRegistry,
    ApprovalReassignmentService,
  ],
})
export class ApprovalsModule {}
