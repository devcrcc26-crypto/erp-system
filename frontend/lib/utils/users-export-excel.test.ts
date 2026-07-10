import { describe, expect, it } from 'vitest';
import { buildUsersExportRows } from './users-export-excel';

describe('buildUsersExportRows', () => {
  it('exports only name, position, discipline, department, role, and last login', () => {
    const rows = buildUsersExportRows(
      [
        {
          id: '1',
          companyId: 'company-1',
          branchId: null,
          departmentId: 'dept-1',
          department: { id: 'dept-1', name: 'Architecture' },
          positionId: 'pos-1',
          position: { id: 'pos-1', title: 'Senior Engineer' },
          discipline: null,
          engineeringDisciplineId: 'disc-1',
          engineeringDiscipline: {
            id: 'disc-1',
            name: 'Architecture',
            nameZh: '建筑',
          },
          firstName: 'Chengyu',
          lastName: 'Cai',
          chineseName: '蔡成禹',
          email: 'chengyu@example.com',
          phone: null,
          preferredLanguage: null,
          preferredTimezone: null,
          preferredDateFormat: null,
          isActive: true,
          mfaEnabled: false,
          emailVerifiedAt: '2024-01-01',
          lastLogin: '2024-06-01T10:00:00.000Z',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          userRoles: [{ id: 'ur-1', roleId: 'r-1', role: { id: 'r-1', name: 'Site Engineer' } }],
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
      (user) =>
        user.userRoles?.map((assignment) => assignment.role.name).join(', ') || '-',
    );

    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0])).toEqual([
      'name',
      'position',
      'discipline',
      'department',
      'role',
      'lastLogin',
    ]);

    const cai = rows.find((row) => row.name.includes('Chengyu Cai'));
    expect(cai).toEqual({
      name: 'Chengyu Cai\n蔡成禹',
      position: 'Senior Engineer',
      discipline: 'Architecture\n建筑',
      department: 'Architecture',
      role: 'Site Engineer',
      lastLogin: new Date('2024-06-01T10:00:00.000Z').toLocaleString(),
    });

    const shimeles = rows.find((row) => row.name === 'Shimeles Ayele');
    expect(shimeles).toEqual({
      name: 'Shimeles Ayele',
      position: '-',
      discipline: '-',
      department: '-',
      role: '-',
      lastLogin: '-',
    });
  });
});
