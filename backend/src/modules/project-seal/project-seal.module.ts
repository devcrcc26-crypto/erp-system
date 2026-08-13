import { Module } from "@nestjs/common";
import { ProjectSealService } from "./application/services/project-seal.service";
import { ProjectSealController } from "./presentation/controllers/project-seal.controller";
import { ApprovalsModule } from "../approvals/approvals.module";
import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { StorageModule } from "../../shared/storage/storage.module";


@Module({
    imports: [ApprovalsModule, HrSharedModule, StorageModule],
    controllers: [ProjectSealController],
    providers: [ProjectSealService],
    exports: [ProjectSealService],
})
export class ProjectSealModule {}