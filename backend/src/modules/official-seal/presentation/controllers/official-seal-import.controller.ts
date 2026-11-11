import { createHrImportController } from '@/modules/hr-shared/application/import-export/hr-import-controller.factory';
import { OfficialSealImportService } from '../../application/services/official-seal-import.service';

/**
 * `GET/POST /hr/official-seal/import*` - template, preview and commit.
 */
export const OfficialSealImportController = createHrImportController({
  route: 'hr/official-seal/import',
  tag: 'HR Official Seal Import',
  templateFileName: 'official-seal-import-template.xlsx',
  entityLabel: 'official seal usage',
  permissions: [
    { module: 'official-seal', action: 'manage' },
  ],
  service: OfficialSealImportService,
});
