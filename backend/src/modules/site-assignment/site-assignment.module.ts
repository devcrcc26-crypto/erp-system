import { Module, forwardRef } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditModule } from '../audit/audit.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { SiteAssignmentService } from './application/services/site-assignment.service';
import { SiteAssignmentController } from './presentation/controllers/site-assignment.controller';
import { SiteAssignmentHrEmployeesController } from './presentation/controllers/site-assignment-hr-employees.controller';

@Module({
  imports: [
    ApprovalsModule,
    AuditModule,
    HrSharedModule,
    NotificationsModule,
    forwardRef(() => AttendanceModule),
  ],
  controllers: [SiteAssignmentController, SiteAssignmentHrEmployeesController],
  providers: [SiteAssignmentService],
  exports: [SiteAssignmentService],
})
export class SiteAssignmentModule {}
