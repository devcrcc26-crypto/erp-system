'use client';

import { Table } from 'antd';
import type { TableProps } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsLgUp, useIsMdUp } from '@/hooks/useMediaQuery';
import { defaultTablePagination } from '@/lib/theme/table-pagination';

/**
 * Shared Ant Design Table with ERP list styling and responsive pagination.
 * Pass `pagination={false}` to disable; `scroll={false}` to use page scroll.
 */
export default function DataTable<T extends object>({
  scroll,
  size,
  className,
  pagination,
  bordered = false,
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
        bordered={bordered}
        pagination={resolvedPagination}
        scroll={resolvedScroll}
        className={['erp-data-table', className].filter(Boolean).join(' ')}
        {...props}
      />
    </div>
  );
}
