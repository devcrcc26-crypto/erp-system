import { Module } from '@nestjs/common';
import { CompanySetupService } from './application/services/company-setup.service';
import { CompanyController } from './presentation/controllers/company.controller';
import { FinancialController } from './presentation/controllers/financial.controller';
import { OrgController } from './presentation/controllers/org.controller';

@Module({
  controllers: [CompanyController, OrgController, FinancialController],
  providers: [CompanySetupService],
  exports: [CompanySetupService],
})
export class CompanySetupModule {}
