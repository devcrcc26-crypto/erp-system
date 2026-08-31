import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { CompanyVehicleService } from './application/services/company-vehicle.service';
import { CompanyVehicleController } from './presentation/controllers/company-vehicle.controller';

/**
 * Company vehicle fleet management — CRUD operations for the vehicle register
 * used by vehicle applications and refueling requests.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [CompanyVehicleController],
  providers: [CompanyVehicleService],
  exports: [CompanyVehicleService],
})
export class CompanyVehicleModule {}
