import { createHrImportController } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import { CompanyVehicleImportService } from '../../application/services/company-vehicle-import.service';

/**
 * `GET/POST /organization/vehicles/import*` - template, preview and commit.
 */
export const CompanyVehicleImportController = createHrImportController({
  route: 'organization/vehicles/import',
  tag: 'Company Vehicle Import',
  templateFileName: 'company-vehicle-import-template.xlsx',
  entityLabel: 'company vehicle',
  permissions: [
    { module: 'vehicles', action: 'edit' },
  ],
  service: CompanyVehicleImportService,
});
