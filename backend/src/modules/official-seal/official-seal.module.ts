import { Module } from "@nestjs/common";
import { OfficialSealService } from "./application/services/official-seal.service";
import { OfficialSealController } from "./presentation/controllers/official-seal.controller";
import { ApprovalsModule } from "../approvals/approvals.module";
import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { StorageModule } from "../../shared/storage/storage.module";


@Module({
    imports: [ApprovalsModule, HrSharedModule, StorageModule],
    controllers: [OfficialSealController],
    providers: [OfficialSealService],
    exports: [OfficialSealService],
})
export class OfficialSealModule {}