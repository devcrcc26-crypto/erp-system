// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { layout } from '@/lib/theme/layout';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Submittal,
  SubmittalPurpose,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { SUBMITTAL_WORKFLOW } from '@/lib/api/workflow';
import { useSubmittals } from '@/lib/query/submittals';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSubmittalStatus,
  isOverdue,
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import SubmittalPackageDrawer from '@/components/modules/projects/submittals/SubmittalPackageDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';

const EXTERNAL_PURPOSES: SubmittalPurpose[] = [
  'DISCIPLINE_SITE',
  'DISCIPLINE_CONSULTANT',
];

function formatPurpose(purpose: SubmittalPurpose | null): string {
  if (purpose === 'DISCIPLINE_SITE') {
    return 'Site engineers';
  }
  if (purpose === 'DISCIPLINE_CONSULTANT') {
    return 'Consultants';
  }
  return '-';
}

export default function ExternalReleasePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [purposeFilter, setPurposeFilter] = useState<
    SubmittalPurpose | undefined
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<string | null>(
    null,
  );
  const lens = useRoleLens();

  const submittalsQuery = useSubmittals(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const submittals = (submittalsQuery.data?.data ?? []).filter((row) =>
    EXTERNAL_PURPOSES.includes(row.submittalPurpose as SubmittalPurpose),
  ).filter((row) =>
    purposeFilter ? row.submittalPurpose === purposeFilter : true,
  );
  const meta = submittalsQuery.data?.meta;

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: 'Submittal #',
        dataIndex: 'submittalNumber',
        key: 'submittalNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedSubmittalId(record.id)}
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
        title: 'Recipient',
        dataIndex: 'submittalPurpose',
        key: 'submittalPurpose',
        render: (value: SubmittalPurpose | null) => formatPurpose(value),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: SubmittalStatus) => (
          <StatusBadge
            label={formatSubmittalStatus(status)}
            variant={submittalStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Issued',
        dataIndex: 'issuedAt',
        key: 'issuedAt',
        render: (value: string | null) => formatProjectDate(value),
      },
      {
        title: 'Due',
        dataIndex: 'dueDate',
        key: 'dueDate',
        render: (value: string | null, record) => (
          <span
            className={
              isOverdue(value) &&
              record.status !== 'APPROVED' &&
              record.status !== 'REJECTED'
                ? 'font-medium text-red-600'
                : undefined
            }
          >
            {formatProjectDate(value)}
          </span>
        ),
      },
    ],
    [],
  );

  if (submittalsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  return (
    <>
      <FormLayout
        title="External release"
        description="Submit discipline-leader-approved design packages to site engineers or consultants for formal review."
        extra={
          lens.canCreateSubmittals ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New external release
            </Button>
          ) : undefined
        }
      >
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Discipline leader workflow"
          description="Only approved and locked design packages can be issued externally. Select packages prepared by the discipline lead and issue them to site engineers or consultants."
        />

        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Submittal APIs are not connected yet."
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search releases"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Recipient"
            className={layout.filterControl}
            value={purposeFilter}
            onChange={(value: SubmittalPurpose | undefined) => {
              resetPage();
              setPurposeFilter(value);
            }}
            options={[
              { value: 'DISCIPLINE_SITE', label: 'Site engineers' },
              { value: 'DISCIPLINE_CONSULTANT', label: 'Consultants' },
            ]}
          />
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControl}
            value={statusFilter}
            onChange={(value: SubmittalStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={SUBMITTAL_WORKFLOW.map((step) => ({
              value: step.key,
              label: step.label,
            }))}
          />
        </Space>

        <DataTable<Submittal>
          rowKey="id"
          columns={columns}
          dataSource={submittals}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Send />}
                title="No external releases"
                description="Issue approved design packages to site engineers or consultants"
                action={
                  lens.canCreateSubmittals && !apiUnavailable
                    ? {
                        label: 'New external release',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <SubmittalPackageDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void submittalsQuery.refetch()}
      />

      <SubmittalDetailDrawer
        projectId={projectId}
        submittalId={selectedSubmittalId}
        onClose={() => setSelectedSubmittalId(null)}
        onUpdated={() => void submittalsQuery.refetch()}
      />
    </>
  );
}
