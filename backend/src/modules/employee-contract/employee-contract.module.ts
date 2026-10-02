import { HrSharedModule } from "../hr-shared/hr-shared.module";
import { PayrollModule } from "../payroll/payroll.module";
import { EmployeeContractCronService } from "./application/services/employee-contract-cron.service";
import { EmployeeContractImportService } from "./application/services/employee-contract-import.service";
import { EmployeeContractService } from "./application/services/employee-contract.service";
import { EmployeeContractImportController } from "./presentation/controllers/employee-contract-import.controller";
import { EmployeeContractController } from "./presentation/controllers/employee-contract.controller";
import { Global, Module } from "@nestjs/common";

@Global()
@Module({
    imports: [HrSharedModule, PayrollModule],
    controllers: [EmployeeContractImportController, EmployeeContractController],
    providers: [
        EmployeeContractService,
        EmployeeContractImportService,
        EmployeeContractCronService,
    ],
    exports: [EmployeeContractService],
})
export class EmployeeContractModule {}
