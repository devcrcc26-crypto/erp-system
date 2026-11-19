'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PaginationMeta, PaginationParams } from '@/lib/api/types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  serverTablePagination,
} from '@/lib/theme/table-pagination';
import type {
  SorterResult,
  TablePaginationConfig,
} from 'antd/es/table/interface';
import type { TableProps } from 'antd';

export type TableSortOrder = 'asc' | 'desc';

export interface UseTablePaginationOptions {
  initialPageSize?: number;
  /** Default server sort field (omit for backend default). */
  initialSortBy?: string;
  /** Default server sort direction. */
  initialSortOrder?: TableSortOrder;
}

/**
 * Shared page/limit/sort state for server-paginated tables.
 */
export function useTablePagination(
  initialPageSizeOrOptions: number | UseTablePaginationOptions = DEFAULT_TABLE_PAGE_SIZE,
): {
  params: PaginationParams;
  sortBy: string | undefined;
  sortOrder: TableSortOrder | undefined;
  resetPage: () => void;
  setSort: (sortBy?: string, sortOrder?: TableSortOrder) => void;
  bindMeta: (meta?: PaginationMeta) => TablePaginationConfig | undefined;
  /**
   * Ant Design Table onChange handler that updates page + server sort.
   * Pass column `key` values that match API `sortBy` fields (or map via `sortFieldMap`).
   */
  handleTableChange: NonNullable<TableProps['onChange']>;
} {
  const options: UseTablePaginationOptions =
    typeof initialPageSizeOrOptions === 'number'
      ? { initialPageSize: initialPageSizeOrOptions }
      : initialPageSizeOrOptions;

  const initialPageSize = options.initialPageSize ?? DEFAULT_TABLE_PAGE_SIZE;
  const { t } = useEpcTranslation();
  const rangeLabel = t('pagination.range');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortBy, setSortBy] = useState<string | undefined>(options.initialSortBy);
  const [sortOrder, setSortOrder] = useState<TableSortOrder | undefined>(
    options.initialSortOrder,
  );

  const params = useMemo((): PaginationParams => {
    const next: PaginationParams = { page, limit: pageSize };
    if (sortBy) {
      next.sortBy = sortBy;
    }
    if (sortOrder) {
      next.sortOrder = sortOrder;
    }
    return next;
  }, [page, pageSize, sortBy, sortOrder]);

  const resetPage = useCallback((): void => {
    setPage(1);
  }, []);

  const setSort = useCallback(
    (nextSortBy?: string, nextSortOrder?: TableSortOrder): void => {
      setSortBy(nextSortBy);
      setSortOrder(nextSortOrder);
      setPage(1);
    },
    [],
  );

  const onPaginationChange = useCallback(
    (nextPage: number, nextPageSize: number): void => {
      if (nextPageSize !== pageSize) {
        setPageSize(nextPageSize);
        setPage(1);
        return;
      }
      setPage(nextPage);
    },
    [pageSize],
  );

  const bindMeta = useCallback(
    (meta?: PaginationMeta): TablePaginationConfig | undefined =>
      meta
        ? serverTablePagination(
            meta,
            onPaginationChange,
            { page, pageSize },
            undefined,
            rangeLabel,
          )
        : undefined,
    [onPaginationChange, page, pageSize, rangeLabel],
  );

  const handleTableChange = useCallback<NonNullable<TableProps['onChange']>>(
    (pagination, _filters, sorter) => {
      const resolved = Array.isArray(sorter) ? sorter[0] : sorter;
      const nextOrder = antOrderToSortOrder(resolved?.order);
      const nextField =
        nextOrder && resolved
          ? resolveSorterField(resolved)
          : undefined;

      if (nextField !== sortBy || nextOrder !== sortOrder) {
        setSortBy(nextField);
        setSortOrder(nextOrder);
        setPage(1);
        return;
      }

      if (pagination?.pageSize && pagination.pageSize !== pageSize) {
        setPageSize(pagination.pageSize);
        setPage(1);
        return;
      }
      if (pagination?.current && pagination.current !== page) {
        setPage(pagination.current);
      }
    },
    [page, pageSize, sortBy, sortOrder],
  );

  return {
    params,
    sortBy,
    sortOrder,
    resetPage,
    setSort,
    bindMeta,
    handleTableChange,
  };
}

function antOrderToSortOrder(
  order: SorterResult['order'] | undefined,
): TableSortOrder | undefined {
  if (order === 'ascend') {
    return 'asc';
  }
  if (order === 'descend') {
    return 'desc';
  }
  return undefined;
}

function resolveSorterField(sorter: SorterResult): string | undefined {
  if (typeof sorter.columnKey === 'string' && sorter.columnKey.length > 0) {
    return sorter.columnKey;
  }
  if (typeof sorter.field === 'string' && sorter.field.length > 0) {
    return sorter.field;
  }
  return undefined;
}

/**
 * Applies controlled `sortOrder` to columns that declare `sorter: true`
 * (or a boolean) so Ant Design shows the active sort indicator.
 */
export function withControlledSort<T extends object>(
  columns: TableProps<T>['columns'],
  sortBy: string | undefined,
  sortOrder: TableSortOrder | undefined,
): TableProps<T>['columns'] {
  if (!columns) {
    return columns;
  }

  const antOrder =
    sortOrder === 'asc' ? 'ascend' : sortOrder === 'desc' ? 'descend' : undefined;

  return columns.map((column) => {
    if (!column || typeof column !== 'object' || !('key' in column)) {
      return column;
    }
    const key = column.key;
    if (typeof key !== 'string') {
      return column;
    }
    if (!('sorter' in column) || !column.sorter) {
      return column;
    }
    return {
      ...column,
      sortOrder: key === sortBy ? antOrder : undefined,
    };
  });
}
