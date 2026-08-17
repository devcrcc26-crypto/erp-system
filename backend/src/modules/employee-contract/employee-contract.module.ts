import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { EmployeeContractService } from "./application/services/employee-contract.service";
import { EmployeeContractController } from "./presentation/controllers/employee-contract.controller";
import { Global, Module } from "@nestjs/common";

@Global()
@Module({
    imports: [HrSharedModule],
    controllers: [EmployeeContractController],
    providers: [EmployeeContractService],
    exports: [EmployeeContractService],
})
export class EmployeeContractModule {}