import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { OvertimeService } from './application/services/overtime.service';
import { OvertimeController } from './presentation/controllers/overtime.controller';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [OvertimeController],
  providers: [OvertimeService],
  exports: [OvertimeService],
})
export class OvertimeModule {}
