import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { EmployeeContractCronService } from "./application/services/employee-contract-cron.service";
import { EmployeeContractService } from "./application/services/employee-contract.service";
import { EmployeeContractController } from "./presentation/controllers/employee-contract.controller";
import { Global, Module } from "@nestjs/common";

@Global()
@Module({
    imports: [HrSharedModule],
    controllers: [EmployeeContractController],
    providers: [EmployeeContractService, EmployeeContractCronService],
    exports: [EmployeeContractService],
})
export class EmployeeContractModule {}