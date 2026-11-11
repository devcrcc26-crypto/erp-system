import { createHrImportController } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import { InspectionRepairImportService } from '../../application/services/inspection-repair-import.service';

/**
 * `GET/POST /hr/inspection-repair/import*` - template, preview and commit.
 */
export const InspectionRepairImportController = createHrImportController({
  route: 'hr/inspection-repair/import',
  tag: 'HR Inspection Repair Import',
  templateFileName: 'inspection-repair-import-template.xlsx',
  entityLabel: 'inspection & repair',
  permissions: [
    { module: 'inspection-repair', action: 'manage' },
  ],
  service: InspectionRepairImportService,
});
