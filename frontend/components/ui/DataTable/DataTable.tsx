'use client';

import { Table } from 'antd';
import type { TableProps } from 'antd';
import { useIsLgUp } from '@/hooks/useMediaQuery';

/**
 * Thin wrapper around Ant Design Table with consistent ERP styling and mobile scroll.
 */
export default function DataTable<T extends object>({
  scroll,
  size,
  className,
  ...props
}: TableProps<T>): React.ReactNode {
  const isLgUp = useIsLgUp();

  const resolvedScroll =
    scroll === undefined
      ? { x: 'max-content' as const }
      : scroll;

  const resolvedSize = size ?? (isLgUp ? 'middle' : 'small');

  return (
    <div className="erp-table-scroll min-w-0 w-full overflow-x-auto">
      <Table<T>
        size={resolvedSize}
        pagination={false}
        scroll={resolvedScroll}
        className={className}
        {...props}
        style={{ ...props.style }}
      />
    </div>
  );
}
