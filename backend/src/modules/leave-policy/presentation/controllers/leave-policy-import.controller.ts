import { createHrImportController } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import { LeavePolicyImportService } from '../../application/services/leave-policy-import.service';

/**
 * `GET/POST /hr/leave-policies/import*` - template, preview and commit.
 */
export const LeavePolicyImportController = createHrImportController({
  route: 'hr/leave-policies/import',
  tag: 'HR Leave Policy Import',
  templateFileName: 'leave-policy-import-template.xlsx',
  entityLabel: 'leave policy',
  permissions: [{ module: 'leave', action: 'manage' }],
  service: LeavePolicyImportService,
});
