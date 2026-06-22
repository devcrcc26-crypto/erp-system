'use client';

import { Table } from 'antd';
import type { TableProps } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsLgUp } from '@/hooks/useMediaQuery';
import { defaultTablePagination } from '@/lib/theme/table-pagination';

/**
 * Thin wrapper around Ant Design Table with consistent ERP styling and mobile scroll.
 * Pagination is enabled by default; pass `pagination={false}` to disable.
 */
export default function DataTable<T extends object>({
  scroll,
  size,
  className,
  pagination,
  ...props
}: TableProps<T>): React.ReactNode {
  const isLgUp = useIsLgUp();
  const { t } = useEpcTranslation();
  const paginationRangeLabel = t('pagination.range');

  const resolvedScroll =
    scroll === undefined
      ? { x: 'max-content' as const }
      : scroll;

  const resolvedSize = size ?? (isLgUp ? 'middle' : 'small');

  const resolvedPagination =
    pagination === false
      ? false
      : pagination ?? defaultTablePagination(undefined, paginationRangeLabel);

  return (
    <div className="erp-table-scroll min-w-0 w-full overflow-x-auto">
      <Table<T>
        size={resolvedSize}
        pagination={resolvedPagination}
        scroll={resolvedScroll}
        className={className}
        {...props}
        style={{ ...props.style }}
      />
    </div>
  );
}
