import { describe, expect, it } from 'vitest';
import { buildUsersExportDirectoryRows } from './users-export-pdf';

describe('buildUsersExportDirectoryRows', () => {
  it('includes the chinese name in the exported directory rows', () => {
    const rows = buildUsersExportDirectoryRows(
      [
        {
          id: '1',
          companyId: 'company-1',
          branchId: null,
          departmentId: null,
          positionId: null,
          discipline: null,
          engineeringDisciplineId: null,
          firstName: 'Wei',
          lastName: 'Zhang',
          chineseName: '张伟',
          email: 'wei@example.com',
          phone: '12345',
          preferredLanguage: null,
          preferredTimezone: null,
          preferredDateFormat: null,
          isActive: true,
          mfaEnabled: false,
          emailVerifiedAt: '2024-01-01',
          lastLogin: null,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      () => 'Active',
      () => 'Admin',
      () => 'Civil',
      () => '-',
    );

    expect(rows[0][1]).toBe('张伟');
  });
});
