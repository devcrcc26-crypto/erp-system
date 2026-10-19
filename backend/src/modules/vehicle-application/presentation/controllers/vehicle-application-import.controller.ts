import { createHrImportController } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import { VehicleApplicationImportService } from '../../application/services/vehicle-application-import.service';

/**
 * `GET/POST /hr/vehicle-applications/import*` - template, preview and commit.
 */
export const VehicleApplicationImportController = createHrImportController({
  route: 'hr/vehicle-applications/import',
  tag: 'HR Vehicle Application Import',
  templateFileName: 'vehicle-application-import-template.xlsx',
  entityLabel: 'vehicle application',
  permissions: [
    { module: 'vehicle-application', action: 'manage' },
  ],
  service: VehicleApplicationImportService,
});
