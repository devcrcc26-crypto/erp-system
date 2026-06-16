'use client';

import { Table } from 'antd';
import type { TableProps } from 'antd';

/**
 * Thin wrapper around Ant Design Table with consistent ERP styling.
 */
export default function DataTable<T extends object>({
  ...props
}: TableProps<T>): React.ReactNode {
  return (
    <Table<T>
      size="middle"
      pagination={false}
      {...props}
      style={{ ...props.style }}
    />
  );
}
