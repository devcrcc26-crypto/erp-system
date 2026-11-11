import { createHrImportController } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import { VehicleRefuelingImportService } from '../../application/services/vehicle-refueling-import.service';

/**
 * `GET/POST /hr/vehicle-refueling/import*` - template, preview and commit.
 */
export const VehicleRefuelingImportController = createHrImportController({
  route: 'hr/vehicle-refueling/import',
  tag: 'HR Vehicle Refueling Import',
  templateFileName: 'vehicle-refueling-import-template.xlsx',
  entityLabel: 'vehicle refueling',
  permissions: [
    { module: 'vehicle-refueling', action: 'manage' },
  ],
  service: VehicleRefuelingImportService,
});
