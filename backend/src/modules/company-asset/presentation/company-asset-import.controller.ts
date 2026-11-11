import { createHrImportController } from '../../hr-shared/application/import-export/hr-import-controller.factory';
import { CompanyAssetImportService } from '../application/services/company-asset-import.service';

/**
 * `GET/POST /organization/assets/import*` - template, preview and commit.
 */
export const CompanyAssetImportController = createHrImportController({
  route: 'organization/assets/import',
  tag: 'Company Asset Import',
  templateFileName: 'company-asset-import-template.xlsx',
  entityLabel: 'company asset',
  permissions: [
    { module: 'assets', action: 'edit' },
  ],
  service: CompanyAssetImportService,
});
