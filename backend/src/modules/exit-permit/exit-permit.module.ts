import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { ExitPermitImportService } from "./application/services/exit-permit-import.service";
import { ExitPermitService } from "./application/services/exit-permit.service";
import { ExitPermitImportController } from "./presentation/exit-permit-import.controller";
import { ExitPermitController } from "./presentation/exit-permit.controller";

@Module({
    imports: [ApprovalsModule, HrSharedModule],
    controllers: [ExitPermitImportController, ExitPermitController],
    providers: [ExitPermitService, ExitPermitImportService],
    exports: [ExitPermitService],
})
export class ExitPermitModule {}
