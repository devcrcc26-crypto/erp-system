import { Module, forwardRef } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditModule } from '../audit/audit.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { SiteAssignmentService } from './application/services/site-assignment.service';
import { SiteAssignmentController } from './presentation/controllers/site-assignment.controller';

@Module({
  imports: [
    ApprovalsModule,
    AuditModule,
    HrSharedModule,
    forwardRef(() => AttendanceModule),
  ],
  controllers: [SiteAssignmentController],
  providers: [SiteAssignmentService],
  exports: [SiteAssignmentService],
})
export class SiteAssignmentModule {}
