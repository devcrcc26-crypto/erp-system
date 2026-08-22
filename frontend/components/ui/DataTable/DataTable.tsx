// UI polish pass - styles only, no logic changes

'use client';

import { Table } from 'antd';
import type { TableProps } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsLgUp, useIsMdUp } from '@/hooks/useMediaQuery';
import { defaultTablePagination } from '@/lib/theme/table-pagination';

/**
 * Thin wrapper around Ant Design Table with consistent ERP styling and mobile scroll.
 * Pagination is enabled by default; pass `pagination={false}` to disable.
 * Pass `scroll={false}` to skip Ant Design’s internal scroll container (page scrolls normally).
 */
export default function DataTable<T extends object>({
  scroll,
  size,
  className,
  pagination,
  ...props
}: Omit<TableProps<T>, 'scroll'> & {
  scroll?: TableProps<T>['scroll'] | false;
}): React.ReactNode {
  const isLgUp = useIsLgUp();
  const isMdUp = useIsMdUp();
  const { t } = useEpcTranslation();
  const paginationRangeLabel = t('pagination.range');

  const resolvedScroll =
    scroll === false
      ? undefined
      : scroll === undefined
        ? { x: 'max-content' as const }
        : scroll;

  const resolvedSize = size ?? (isLgUp ? 'middle' : 'small');

  const basePagination =
    pagination === false
      ? false
      : (pagination ?? defaultTablePagination(undefined, paginationRangeLabel));

  const resolvedPagination =
    basePagination === false
      ? false
      : {
          ...basePagination,
          simple: !isMdUp,
          showSizeChanger: isMdUp
            ? (basePagination.showSizeChanger ?? true)
            : false,
          showTotal: isMdUp ? basePagination.showTotal : undefined,
        };

  return (
    <div className="erp-table-scroll min-w-0 w-full overflow-x-auto overflow-y-clip">
      <Table<T>
        size={resolvedSize}
        pagination={resolvedPagination}
        scroll={resolvedScroll}
        className={['erp-data-table', className].filter(Boolean).join(' ')}
        {...props}
        style={{ ...props.style }}
      />
    </div>
  );
}
