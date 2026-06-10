import { PaginationMeta } from '../dtos/pagination-query.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPrismaPagination(
  page: number,
  limit: number,
): { skip: number; take: number } {
  return {
    skip: (page - 1) * limit,
    take: limit,
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
  ]);

  const field = allowedFields.has(sortBy) ? sortBy : 'createdAt';
  return { [field]: sortOrder };
}
