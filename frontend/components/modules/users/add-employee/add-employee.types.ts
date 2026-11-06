import type { Dayjs } from 'dayjs';
import type { EmployeeProfileFormValues } from '@/components/modules/users/EmployeeProfileFormFields';

export interface AddEmployeeFormValues extends EmployeeProfileFormValues {
  firstName: string;
  lastName: string;
  chineseName?: string;
  email?: string;
  phone?: string;
  secondaryPhone?: string;
  departmentId?: string;
  positionId?: string;
  seniorityLevelId?: string;
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
  /** OA login name (exact sign-in name). */
  loginName?: string;
  /** Approver only - users.edit only (add and edit). */
  excludedFromHrProcesses?: boolean;
  excludedReason?: string;
  dateOfBirth?: Dayjs;
  /**
   * Create only: how the employee gets first sign-in access when email is set.
   * Invite = activation email; temporaryPassword = one-time password + must change.
   */
  accountAccessMethod?: 'invite' | 'temporaryPassword';
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
    'secondaryPhone',
    'loginName',
    'excludedFromHrProcesses',
    'excludedReason',
    'roleAssignments',
  ],
  [
    'dateOfBirth',
    'nationality',
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
    'employeeType',
    'employmentDate',
    'departmentId',
    'positionId',
    'seniorityLevelId',
    'reportsToUserId',
    'engineeringDisciplineId',
    'bankName',
    'bankBranch',
    'bankAccountNumber',
    'tin',
  ],
  ['educationLevel', 'fieldOfStudy', 'yearsOfExperience'],
  ['leavePolicyId', 'workScheduleId'],
  [],
];
