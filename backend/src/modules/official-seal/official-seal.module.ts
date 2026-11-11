import { Module } from "@nestjs/common";
import { OfficialSealImportService } from "./application/services/official-seal-import.service";
import { OfficialSealService } from "./application/services/official-seal.service";
import { OfficialSealPdfService } from "./application/services/official-seal-pdf.service";
import { OfficialSealImportController } from "./presentation/controllers/official-seal-import.controller";
import { OfficialSealController } from "./presentation/controllers/official-seal.controller";
import { ApprovalsModule } from "../approvals/approvals.module";
import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { StorageModule } from "../../shared/storage/storage.module";

@Module({
    imports: [ApprovalsModule, HrSharedModule, StorageModule],
    controllers: [OfficialSealImportController, OfficialSealController],
    providers: [OfficialSealService, OfficialSealImportService, OfficialSealPdfService],
    exports: [OfficialSealService],
})
export class OfficialSealModule {}
