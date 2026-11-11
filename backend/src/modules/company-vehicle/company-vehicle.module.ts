import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { HrSharedModule } from '../hr-shared/hr-shared.module';
import { CompanyVehicleImportService } from './application/services/company-vehicle-import.service';
import { CompanyVehicleService } from './application/services/company-vehicle.service';
import { CompanyVehicleImportController } from './presentation/controllers/company-vehicle-import.controller';
import { CompanyVehicleController } from './presentation/controllers/company-vehicle.controller';

/**
 * Company vehicle fleet management - CRUD operations for the vehicle register
 * used by vehicle applications and refueling requests, plus the Excel import
 * that registers vehicles in bulk.
 */
@Module({
  imports: [DocumentsModule, HrSharedModule],
  controllers: [CompanyVehicleImportController, CompanyVehicleController],
  providers: [CompanyVehicleService, CompanyVehicleImportService],
  exports: [CompanyVehicleService],
})
export class CompanyVehicleModule {}
