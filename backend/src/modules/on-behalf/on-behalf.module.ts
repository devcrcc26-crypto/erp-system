import { forwardRef, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditModule } from '../audit/audit.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { OnBehalfController } from './on-behalf.controller';
import { OnBehalfService } from './on-behalf.service';

/**
 * "Submit on behalf of" eligibility, chain membership and creator auto-approve,
 * shared by all HR request modules (re-exported through HrSharedModule).
 */
@Module({
  imports: [ApprovalsModule, AuditModule, forwardRef(() => HrSharedModule)],
  controllers: [OnBehalfController],
  providers: [OnBehalfService],
  exports: [OnBehalfService],
})
export class OnBehalfModule {}
