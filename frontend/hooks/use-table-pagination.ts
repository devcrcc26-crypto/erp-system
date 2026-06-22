'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PaginationMeta, PaginationParams } from '@/lib/api/types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  serverTablePagination,
} from '@/lib/theme/table-pagination';
import type { TablePaginationConfig } from 'antd/es/table/interface';

/**
 * Shared page/limit state for server-paginated tables.
 */
export function useTablePagination(
  initialPageSize: number = DEFAULT_TABLE_PAGE_SIZE,
): {
  params: PaginationParams;
  resetPage: () => void;
  bindMeta: (meta?: PaginationMeta) => TablePaginationConfig | undefined;
} {
  const { t } = useEpcTranslation();
  const rangeLabel = t('pagination.range');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const params = useMemo(
    (): PaginationParams => ({ page, limit: pageSize }),
    [page, pageSize],
  );

  const resetPage = useCallback((): void => {
    setPage(1);
  }, []);

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

  return { params, resetPage, bindMeta };
}
