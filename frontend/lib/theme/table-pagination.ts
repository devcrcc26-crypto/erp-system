import type { TablePaginationConfig } from 'antd/es/table/interface';
import type { PaginationMeta } from '@/lib/api/types';

export const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_TABLE_PAGE_SIZE = 20;

/** Formats Ant Design table pagination total label. */
export function formatTableTotal(
  total: number,
  range: [number, number],
  label?: string,
): string {
  if (label) {
    return label
      .replace('{{from}}', String(range[0]))
      .replace('{{to}}', String(range[1]))
      .replace('{{total}}', String(total));
  }
  return `${range[0]}-${range[1]} of ${total}`;
}

/** Client-side pagination defaults for in-memory table data. */
export function defaultTablePagination(
  overrides?: Partial<TablePaginationConfig>,
  rangeLabel?: string,
): TablePaginationConfig {
  return {
    defaultPageSize: DEFAULT_TABLE_PAGE_SIZE,
    showSizeChanger: true,
    pageSizeOptions: [...TABLE_PAGE_SIZE_OPTIONS],
    showTotal: (total, range) => formatTableTotal(total, range, rangeLabel),
    ...overrides,
  };
}

/** Server-driven pagination bound to API list meta. */
export function serverTablePagination(
  meta: PaginationMeta,
  onChange: (page: number, pageSize: number) => void,
  state?: { page: number; pageSize: number },
  overrides?: Partial<TablePaginationConfig>,
  rangeLabel?: string,
): TablePaginationConfig {
  const currentPage = state?.page ?? meta.page;
  const currentPageSize = state?.pageSize ?? meta.limit;

  return {
    current: currentPage,
    pageSize: currentPageSize,
    total: meta.total,
    showSizeChanger: true,
    pageSizeOptions: [...TABLE_PAGE_SIZE_OPTIONS],
    showTotal: (total, range) => formatTableTotal(total, range, rangeLabel),
    onChange: (page, pageSize) => {
      onChange(page, pageSize ?? currentPageSize);
    },
    onShowSizeChange: (_current, pageSize) => {
      onChange(1, pageSize);
    },
    ...overrides,
  };
}
