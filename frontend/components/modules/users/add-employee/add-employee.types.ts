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
  roleId?: string;
  engineeringDisciplineId?: string;
  isActive: boolean;
  dateOfBirth?: Dayjs;
  experienceStartDate?: Dayjs;
}

export const ADD_EMPLOYEE_STEP_FIELDS: (keyof AddEmployeeFormValues)[][] = [
  ['firstName', 'lastName', 'middleName', 'gender'],
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
    'departmentId',
    'positionId',
    'reportsToUserId',
    'engineeringDisciplineId',
    'roleId',
  ],
  ['educationLevel', 'fieldOfStudy', 'experienceStartDate'],
  ['leavePolicyId'],
  [],
];
