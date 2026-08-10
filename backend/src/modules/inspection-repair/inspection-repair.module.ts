import {Global, Module} from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { InspectionRepairController } from './presentation/controllers/inspection-repair.controller';
import { InspectionRepairService } from './application/services/inspection-repair.service';

@Global()
@Module({
    imports: [ApprovalsModule, HrSharedModule],
    controllers: [InspectionRepairController],
    providers: [InspectionRepairService],
    exports: [InspectionRepairService],
})

export class InspectionRepairModule {}