import { createHrImportController } from '../../../hr-shared/application/import-export/hr-import-controller.factory';
import { EmployeePerDiemRateImportService } from '../../application/services/employee-per-diem-rate-import.service';

/**
 * `GET/POST /hr/employee-per-diem-rates/import*` - template, preview, commit.
 */
export const EmployeePerDiemRateImportController = createHrImportController({
  route: 'hr/employee-per-diem-rates/import',
  tag: 'HR Employee Per Diem Rate Import',
  templateFileName: 'employee-per-diem-rate-import-template.xlsx',
  entityLabel: 'employee per diem rate',
  permissions: [
    { module: 'per-diem', action: 'manage' },
  ],
  service: EmployeePerDiemRateImportService,
});
