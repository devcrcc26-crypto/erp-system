import { Module } from "@nestjs/common";
import { ProjectSealImportService } from "./application/services/project-seal-import.service";
import { ProjectSealService } from "./application/services/project-seal.service";
import { ProjectSealPdfService } from "./application/services/project-seal-pdf.service";
import { ProjectSealImportController } from "./presentation/controllers/project-seal-import.controller";
import { ProjectSealController } from "./presentation/controllers/project-seal.controller";
import { ApprovalsModule } from "../approvals/approvals.module";
import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { StorageModule } from "../../shared/storage/storage.module";

@Module({
    imports: [ApprovalsModule, HrSharedModule, StorageModule],
    controllers: [ProjectSealImportController, ProjectSealController],
    providers: [ProjectSealService, ProjectSealImportService, ProjectSealPdfService],
    exports: [ProjectSealService],
})
export class ProjectSealModule {}
