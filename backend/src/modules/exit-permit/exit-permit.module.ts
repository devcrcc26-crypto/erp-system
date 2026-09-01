import { ExitPermitService } from "./application/services/exit-permit.service";
import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { ExitPermitController } from "./presentation/exit-permit.controller";
import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";

@Module({
    imports: [ApprovalsModule, HrSharedModule],
    controllers: [ExitPermitController],
    providers: [ExitPermitService],
    exports: [ExitPermitService],
})
export class ExitPermitModule {}