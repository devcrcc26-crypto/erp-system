import type { User } from '@/lib/api/types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import { buildUsersExportRows } from '@/lib/utils/users-export-excel';

/**
 * Excel export for the user directory.
 *
 * Row building stays in `users-export-excel.ts` - it is covered by tests and
 * its camelCase keys line up with the import template. This module only puts
 * the human-readable headers on top of those keys.
 */
export function buildUsersExportSheets(
  users: User[],
  formatUserRoles: (user: User) => string,
  statusLabel: (user: User) => string,
): HrExportSheet[] {
  return [
    {
      name: 'Users',
      columns: [
        { header: 'Email', key: 'email', width: 32 },
        { header: 'First Name', key: 'firstName', width: 16 },
        { header: 'Last Name', key: 'lastName', width: 16 },
        { header: 'Middle Name', key: 'middleName', width: 16 },
        { header: 'Chinese Name', key: 'chineseName', width: 16 },
        { header: 'Role', key: 'role', width: 24 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Discipline', key: 'discipline', width: 24 },
        { header: 'Gender', key: 'gender', width: 12 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Position', key: 'position', width: 20 },
        { header: 'Employee ID', key: 'employeeId', width: 16 },
        { header: 'Nationality', key: 'nationality', width: 14 },
        { header: 'Employee Type', key: 'employeeType', width: 16 },
        { header: 'Date of Birth', key: 'dateOfBirth', width: 14 },
        { header: 'National ID', key: 'nationalId', width: 16 },
        { header: 'Education Level', key: 'educationLevel', width: 16 },
        { header: 'Field of Study', key: 'fieldOfStudy', width: 20 },
        { header: 'Experience As Of', key: 'yearsOfExperienceAsOf', width: 18 },
        { header: 'Years of Experience', key: 'yearsOfExperience', width: 18 },
        { header: 'Country', key: 'addressCountry', width: 16 },
        { header: 'Region', key: 'addressRegion', width: 16 },
        { header: 'City', key: 'addressCity', width: 16 },
        { header: 'Subcity / Zone', key: 'addressSubcity', width: 16 },
        { header: 'Woreda', key: 'addressWoreda', width: 14 },
        { header: 'House Number', key: 'addressHouseNumber', width: 16 },
        { header: 'Leave Policy', key: 'leavePolicy', width: 20 },
        { header: 'Emergency Contacts', key: 'emergencyContacts', width: 40 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Last Login', key: 'lastLogin', width: 22 },
      ],
      rows: buildUsersExportRows(users, formatUserRoles, statusLabel).map(
        (row) => ({ ...row }),
      ),
    },
  ];
}
