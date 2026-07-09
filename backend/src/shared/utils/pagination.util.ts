import { PaginationMeta } from '../dtos/pagination-query.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPrismaPagination(
  page: number | string,
  limit: number | string,
): { skip: number; take: number } {
  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const safeLimit = Math.max(1, Number.parseInt(String(limit), 10) || 20);
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 0,
    },
  };
}

export function buildOrderBy(
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Record<string, 'asc' | 'desc'> {
  const allowedFields = new Set([
    'createdAt',
    'updatedAt',
    'name',
    'code',
    'email',
    'firstName',
    'lastName',
    'title',
    'periodNumber',
    'startDate',
    'departmentId',
    'positionId',
    'isActive',
  ]);

  const field = allowedFields.has(sortBy) ? sortBy : 'createdAt';
  return { [field]: sortOrder };
}
