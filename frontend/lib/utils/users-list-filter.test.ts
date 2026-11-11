import { describe, expect, it } from 'vitest';
import type { User } from '@/lib/api/types';
import { compareEmployeeIds, filterAndSortUsers } from '@/lib/utils/users-list-filter';

function user(id: string, employeeId: string | null, firstName = id): User {
  return {
    id,
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@company.local`,
    employeeId,
    isActive: true,
  } as unknown as User;
}

const ids = (users: User[]): Array<string | null | undefined> =>
  users.map((entry) => entry.employeeId);

describe('employee ID sorting', () => {
  it('compares digit runs as numbers', () => {
    expect(compareEmployeeIds('EM-2', 'EM-10')).toBeLessThan(0);
    expect(compareEmployeeIds('EM-045', 'EM-103')).toBeLessThan(0);
    expect(compareEmployeeIds('EM-9', 'EM-045')).toBeLessThan(0);
  });

  it('sorts naturally, keeping missing IDs last in both directions', () => {
    const users = [
      user('a', 'EM-10'),
      user('b', null),
      user('c', 'EM-2'),
      user('d', 'EM-045'),
      user('e', ''),
    ];

    const asc = filterAndSortUsers({ users: [...users], search: '', sortBy: 'employeeId', sortOrder: 'asc' });
    expect(ids(asc).slice(0, 3)).toEqual(['EM-2', 'EM-10', 'EM-045']);
    expect(ids(asc).slice(3).every((value) => !value)).toBe(true);

    const desc = filterAndSortUsers({ users: [...users], search: '', sortBy: 'employeeId', sortOrder: 'desc' });
    expect(ids(desc).slice(0, 3)).toEqual(['EM-045', 'EM-10', 'EM-2']);
    expect(ids(desc).slice(3).every((value) => !value)).toBe(true);
  });
});

describe('search', () => {
  const users = [
    user('a', 'EM-045', 'Helen'),
    user('b', 'EM-103', 'Sony'),
    user('c', null, 'Abel'),
  ];

  it('finds an employee by a partial employee ID', () => {
    expect(ids(filterAndSortUsers({ users, search: '045' }))).toEqual(['EM-045']);
    expect(ids(filterAndSortUsers({ users, search: 'em-10' }))).toEqual(['EM-103']);
  });

  it('still matches name and email', () => {
    expect(ids(filterAndSortUsers({ users, search: 'sony' }))).toEqual(['EM-103']);
    expect(ids(filterAndSortUsers({ users, search: 'abel@company' }))).toEqual([null]);
  });
});
