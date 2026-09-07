import { Global, Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { OvertimeImportService } from './application/services/overtime-import.service';
import { OvertimeService } from './application/services/overtime.service';
import { OvertimeImportController } from './presentation/controllers/overtime-import.controller';
import { OvertimeController } from './presentation/controllers/overtime.controller';

@Global()
@Module({
  imports: [ApprovalsModule, HrSharedModule],
  controllers: [OvertimeImportController, OvertimeController],
  providers: [OvertimeService, OvertimeImportService],
  exports: [OvertimeService],
})
export class OvertimeModule {}
