import type { Dayjs } from 'dayjs';
import type { EmployeeProfileFormValues } from '@/components/modules/users/EmployeeProfileFormFields';

export interface AddEmployeeFormValues extends EmployeeProfileFormValues {
  firstName: string;
  lastName: string;
  chineseName?: string;
  email?: string;
  phone?: string;
  departmentId?: string;
  positionId?: string;
  reportsToUserId?: string;
  /** @deprecated Prefer roleAssignments. */
  roleId?: string;
  roleAssignments?: Array<{
    roleId: string;
    roleName: string;
    isPrimary: boolean;
  }>;
  engineeringDisciplineId?: string;
  isActive: boolean;
  dateOfBirth?: Dayjs;
  experienceStartDate?: Dayjs;
}

export const ADD_EMPLOYEE_STEP_FIELDS: (keyof AddEmployeeFormValues)[][] = [
  [
    'firstName',
    'lastName',
    'middleName',
    'chineseName',
    'gender',
    'email',
    'phone',
    'roleAssignments',
  ],
  [
    'dateOfBirth',
    'nationalId',
    'addressCountry',
    'addressRegion',
    'addressCity',
    'addressSubcity',
    'addressWoreda',
    'addressHouseNumber',
    'emergencyContacts',
  ],
  [
    'employeeId',
    'nationality',
    'employeeType',
    'employmentDate',
    'departmentId',
    'positionId',
    'reportsToUserId',
    'engineeringDisciplineId',
    'bankName',
    'bankBranch',
    'bankAccountNumber',
    'tin',
  ],
  ['educationLevel', 'fieldOfStudy', 'experienceStartDate'],
  ['leavePolicyId', 'workScheduleId'],
  [],
];
