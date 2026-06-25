// Gap completion — new

'use client';

import { useMemo, useState } from 'react';
import { Button, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Package } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { layout } from '@/lib/theme/layout';
import type {
  Deliverable,
  DeliverableStatus,
} from '@/lib/api/project-management.types';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useDeliverables } from '@/lib/query/deliverables';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  deliverableStatusVariant,
  formatDeliverableStatus,
} from '@/lib/utils/pm-status-display';
import DeliverableDrawer from '@/components/modules/projects/deliverables/DeliverableDrawer';
import CreateDeliverableDrawer from '@/components/modules/projects/deliverables/CreateDeliverableDrawer';

const STATUS_OPTIONS: Array<{ value: DeliverableStatus; label: string }> = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'WAIVED', label: 'Waived' },
];

export default function DeliverableList({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const pm = usePmCapabilities();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [statusFilter, setStatusFilter] = useState<
    DeliverableStatus | undefined
  >();
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const disciplinesQuery = useProjectDisciplines(projectId, true);
  const listQuery = useDeliverables(projectId, {
    ...params,
    status: statusFilter,
    disciplineId: disciplineFilter,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((row) => ({
        value: row.id,
        label: row.disciplineName,
      })),
    [disciplinesQuery.data],
  );

  const columns: ColumnsType<Deliverable> = useMemo(
    () => [
      {
        title: 'Title',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: DeliverableStatus) => (
          <StatusBadge
            label={formatDeliverableStatus(status)}
            variant={deliverableStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Discipline',
        dataIndex: 'taskDisciplineName',
        key: 'taskDisciplineName',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Planned date',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null) => formatProjectDate(value),
      },
    ],
    [],
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Deliverables"
        description="Track engineering deliverables from planning through approval."
        extra={
          pm.schedule.canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              New deliverable
            </Button>
          ) : undefined
        }
      >
        <Space wrap className="!mb-4">
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControlSm}
            value={statusFilter}
            onChange={(value: DeliverableStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={STATUS_OPTIONS}
          />
          <Select
            allowClear
            placeholder="Discipline"
            className={layout.filterControl}
            value={disciplineFilter}
            onChange={(value: string | undefined) => {
              resetPage();
              setDisciplineFilter(value);
            }}
            loading={disciplinesQuery.isLoading}
            options={disciplineOptions}
          />
        </Space>

        <DataTable<Deliverable>
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
                icon={<Package />}
                title="No deliverables defined yet"
                description="Add deliverables to track engineering outputs"
                action={
                  pm.schedule.canCreate
                    ? {
                        label: 'New deliverable',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <CreateDeliverableDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void listQuery.refetch()}
      />

      <DeliverableDrawer
        projectId={projectId}
        deliverableId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void listQuery.refetch()}
      />
    </>
  );
}
