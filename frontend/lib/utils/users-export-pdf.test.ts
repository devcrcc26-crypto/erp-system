import { describe, expect, it } from 'vitest';
import { buildUsersExportDirectoryRows } from './users-export-pdf';

describe('buildUsersExportDirectoryRows', () => {
  it('stacks latin and chinese names in the Name cell and omits a chinese column', () => {
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
          firstName: 'Chengyu',
          lastName: 'Cai',
          chineseName: '蔡成禹',
          email: 'chengyu@example.com',
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
        {
          id: '2',
          companyId: 'company-1',
          branchId: null,
          departmentId: null,
          positionId: null,
          discipline: null,
          engineeringDisciplineId: null,
          firstName: 'Shimeles',
          lastName: 'Ayele',
          chineseName: null,
          email: 'shimeles@example.com',
          phone: null,
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

    const cai = rows.find((row) => {
      const nameCell = row[0];
      return (
        typeof nameCell === 'object' &&
        nameCell !== null &&
        'content' in nameCell &&
        String(nameCell.content).includes('Chengyu Cai')
      );
    });
    const shimeles = rows.find((row) => {
      const nameCell = row[0];
      return (
        typeof nameCell === 'object' &&
        nameCell !== null &&
        'content' in nameCell &&
        String(nameCell.content) === 'Shimeles Ayele'
      );
    });

    expect(cai).toBeDefined();
    expect(cai).toHaveLength(7);
    expect(cai?.[0]).toEqual({
      content: 'Chengyu Cai\n蔡成禹',
      styles: {
        font: 'NotoSansSC',
        cellWidth: 'auto',
      },
    });
    expect(cai?.[1]).toBe('chengyu@example.com');

    expect(shimeles).toBeDefined();
    expect(shimeles).toHaveLength(7);
    expect(shimeles?.[0]).toEqual({
      content: 'Shimeles Ayele',
      styles: {
        font: 'NotoSansSC',
        cellWidth: 'auto',
      },
    });
  });
});
