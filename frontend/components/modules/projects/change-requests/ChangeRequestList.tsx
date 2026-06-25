// Gap completion — new

'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { GitBranch } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import type {
  ChangeRequestStatus,
  ProjectChangeRequest,
} from '@/lib/api/project-management.types';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useChangeRequests } from '@/lib/query/change-requests';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  changeRequestStatusVariant,
  formatChangeRequestStatus,
} from '@/lib/utils/pm-status-display';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';
import CreateChangeRequestDrawer from '@/components/modules/projects/change-requests/CreateChangeRequestDrawer';

const STATUS_OPTIONS: Array<{ value: ChangeRequestStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function ChangeRequestList({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const pm = usePmCapabilities();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    ChangeRequestStatus | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useChangeRequests(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const columns: ColumnsType<ProjectChangeRequest> = useMemo(
    () => [
      {
        title: 'CR Number',
        dataIndex: 'changeNumber',
        key: 'changeNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0 font-mono text-[12px]"
            style={{ color: tokens.colorTeal600 }}
            onClick={() => setSelectedId(record.id)}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Title',
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: ChangeRequestStatus) => (
          <StatusBadge
            label={formatChangeRequestStatus(status)}
            variant={changeRequestStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value: string) => formatProjectDate(value),
      },
    ],
    [],
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Change requests"
        description="Track scope changes from identification through approval."
        extra={
          pm.projects.canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              New change request
            </Button>
          ) : undefined
        }
      >
        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search change requests"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControlSm}
            value={statusFilter}
            onChange={(value: ChangeRequestStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={STATUS_OPTIONS}
          />
        </Space>

        <DataTable<ProjectChangeRequest>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isLoading}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedId(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: listQuery.isLoading ? (
              <Table
                pagination={false}
                showHeader={false}
                dataSource={[1, 2, 3]}
                columns={[{ render: () => <div className="erp-page-skeleton h-10 w-full rounded" /> }]}
              />
            ) : (
              <TableEmptyState
                icon={<GitBranch />}
                title="No change requests yet"
                description="Create a change request to track scope impacts"
                action={
                  pm.projects.canCreate
                    ? {
                        label: 'New change request',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <CreateChangeRequestDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void listQuery.refetch()}
      />

      <ChangeRequestDrawer
        projectId={projectId}
        changeRequestId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void listQuery.refetch()}
      />
    </>
  );
}
