import { createHrImportController } from '@/modules/hr-shared/application/import-export/hr-import-controller.factory';
import { ProjectSealImportService } from '../../application/services/project-seal-import.service';

/**
 * `GET/POST /hr/project-seal/import*` - template, preview and commit.
 */
export const ProjectSealImportController = createHrImportController({
  route: 'hr/project-seal/import',
  tag: 'HR Project Seal Import',
  templateFileName: 'project-seal-import-template.xlsx',
  entityLabel: 'project seal usage',
  permissions: [
    { module: 'project-seal', action: 'manage' },
  ],
  service: ProjectSealImportService,
});
