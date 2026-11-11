import { createHrImportController } from '../../hr-shared/application/import-export/hr-import-controller.factory';
import { ExitPermitImportService } from '../application/services/exit-permit-import.service';

/**
 * `GET/POST /hr/exit-permits/import*` - template, preview and commit.
 */
export const ExitPermitImportController = createHrImportController({
  route: 'hr/exit-permits/import',
  tag: 'HR Exit Permit Import',
  templateFileName: 'exit-permit-import-template.xlsx',
  entityLabel: 'exit permit',
  permissions: [
    { module: 'exit-permit', action: 'manage' },
  ],
  service: ExitPermitImportService,
});
