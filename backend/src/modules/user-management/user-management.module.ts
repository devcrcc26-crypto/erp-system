import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { LeavePolicyModule } from '../leave-policy/leave-policy.module';
import { WorkScheduleModule } from '../work-schedule/work-schedule.module';
import { EmploymentLifecycleService } from './application/services/employment-lifecycle.service';
import { EmploymentSeparationCron } from './application/services/employment-separation.cron';
import { EmploymentSeparationService } from './application/services/employment-separation.service';
import { UserImportService } from './application/services/user-import.service';
import { UserInvitationDispatchService } from './application/services/user-invitation-dispatch.service';
import { UserManagementService } from './application/services/user-management.service';
import { UserProvisioningService } from './application/services/user-provisioning.service';
import { RolesController } from './presentation/controllers/roles.controller';
import { UsersImportController } from './presentation/controllers/users-import.controller';
import { UsersController } from './presentation/controllers/users.controller';

@Module({
  imports: [
    ApprovalsModule,
    AttendanceModule,
    AuditModule,
    AuthModule,
    DocumentsModule,
    LeavePolicyModule,
    WorkScheduleModule,
  ],
  controllers: [UsersImportController, UsersController, RolesController],
  providers: [
    UserManagementService,
    UserProvisioningService,
    UserImportService,
    UserInvitationDispatchService,
    EmploymentSeparationService,
    EmploymentLifecycleService,
    EmploymentSeparationCron,
  ],
  exports: [UserManagementService, UserProvisioningService, EmploymentSeparationService],
})
export class UserManagementModule {}
