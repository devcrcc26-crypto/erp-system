import type { User } from '@/lib/api/types';

export type UsersListSortField =
  | 'name'
  | 'employeeId'
  | 'email'
  | 'department'
  | 'position'
  | 'status';

export interface UsersListFilterInput {
  users: User[];
  search: string;
  disciplineId?: string;
  departmentId?: string;
  positionId?: string;
  isActive?: boolean;
  sortBy?: UsersListSortField;
  sortOrder?: 'asc' | 'desc';
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Natural order for employee IDs: digit runs compare as numbers, so
 * "EM-2" < "EM-10" < "EM-045" < "EM-103" (leading zeros don't matter).
 */
export function compareEmployeeIds(a: string, b: string): number {
  return naturalCollator.compare(a, b);
}

function matchesSearch(user: User, search: string): boolean {
  if (!search) {
    return true;
  }
  const haystack = [
    user.firstName,
    user.lastName,
    user.middleName,
    user.chineseName,
    user.email,
    user.phone,
    user.employeeId,
    user.department?.name,
    user.position?.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function sortValue(user: User, field: UsersListSortField): string | number {
  switch (field) {
    case 'email':
      return user.email ?? '';
    case 'department':
      return user.department?.name ?? '';
    case 'position':
      return user.position?.title ?? '';
    case 'status':
      return user.isActive ? 1 : 0;
    case 'employeeId':
      return user.employeeId ?? '';
    case 'name':
    default:
      return `${user.lastName} ${user.firstName}`;
  }
}

/**
 * Filters and sorts the in-memory user directory for the users list page.
 */
export function filterAndSortUsers(input: UsersListFilterInput): User[] {
  const {
    users,
    search,
    disciplineId,
    departmentId,
    positionId,
    isActive,
    sortBy,
    sortOrder = 'asc',
  } = input;

  const filtered = users.filter((user) => {
    if (!matchesSearch(user, search)) {
      return false;
    }
    if (disciplineId && user.engineeringDisciplineId !== disciplineId) {
      return false;
    }
    if (departmentId && user.departmentId !== departmentId) {
      return false;
    }
    if (positionId && user.positionId !== positionId) {
      return false;
    }
    if (isActive !== undefined && user.isActive !== isActive) {
      return false;
    }
    return true;
  });

  if (!sortBy) {
    return filtered.sort((a, b) => {
      const last = compareText(a.lastName, b.lastName);
      if (last !== 0) {
        return last;
      }
      return compareText(a.firstName, b.firstName);
    });
  }

  const direction = sortOrder === 'desc' ? -1 : 1;

  if (sortBy === 'employeeId') {
    // Employees without an ID stay at the end in both directions.
    return filtered.sort((a, b) => {
      const left = a.employeeId?.trim() ?? '';
      const right = b.employeeId?.trim() ?? '';
      if (!left || !right) {
        return Number(!left) - Number(!right);
      }
      return compareEmployeeIds(left, right) * direction;
    });
  }

  return filtered.sort((a, b) => {
    const left = sortValue(a, sortBy);
    const right = sortValue(b, sortBy);
    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * direction;
    }
    return compareText(String(left), String(right)) * direction;
  });
}

/**
 * Slices a filtered list into a page for client-side table pagination.
 */
export function paginateUsers(
  users: User[],
  page: number,
  limit: number,
): {
  data: User[];
  meta: { total: number; page: number; limit: number; pages: number };
} {
  const total = users.length;
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * limit;
  return {
    data: users.slice(start, start + limit),
    meta: { total, page: safePage, limit, pages },
  };
}
