// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Submittal,
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
import ConstructionSubmittalDrawer from '@/components/modules/projects/submittals/ConstructionSubmittalDrawer';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import Link from 'next/link';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';

export default function SubmittalsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<string | null>(
    null,
  );
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const resolveUserName = useUserNameLookup();

  const submittalsQuery = useSubmittals(
    projectId,
    {
      ...params,
      search: search.trim() || undefined,
      status: statusFilter,
      submittalPurpose: 'IN_CONSTRUCTION',
    },
    !permLoading && lens.canViewSubmittals,
  );

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
        title: 'Category',
        dataIndex: 'category',
        key: 'category',
      },
      {
        title: 'Rev',
        dataIndex: 'revisionNumber',
        key: 'revisionNumber',
        align: 'right',
        width: 64,
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
        title: 'Assigned to',
        dataIndex: 'assignedTo',
        key: 'assignedTo',
        render: (value: string | null) =>
          value ? resolveUserName(value) : '-',
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
      {
        title: 'Contractor',
        dataIndex: 'contractor',
        key: 'contractor',
        render: (value: string | null) => value ?? '-',
      },
    ],
    [resolveUserName],
  );

  if (permLoading || submittalsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewSubmittals) {
    return null;
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;

  return (
    <ProjectModuleGate projectId={projectId} module="submittals">
    <>
      <FormLayout
        title="Construction submittals"
        description="Material approvals, shop drawings, and product data submitted to discipline leaders before purchase or installation."
        extra={
          <Space>
            <Link href={`/projects/${projectId}/submittals/external-release`}>
              <Button>External release</Button>
            </Link>
            {lens.canCreateSubmittals && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateOpen(true)}
                disabled={apiUnavailable}
              >
                New submittal
              </Button>
            )}
          </Space>
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Submittal APIs are not connected yet."
            description="This page is ready - data will appear when the project management backend module is available."
          />
        )}

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search submittals"
            className={layout.filterControl}
            onSearch={(value: string) => {
              resetPage();
              setSearch(value);
            }}
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
                title="No construction submittals"
                description="Create a submittal with design packages and documents for discipline leader approval"
                action={
                  lens.canCreateSubmittals && !apiUnavailable
                    ? {
                        label: 'New submittal',
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <ConstructionSubmittalDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onCreated={(submittalId) => {
          void submittalsQuery.refetch();
          setSelectedSubmittalId(submittalId);
        }}
      />

      <SubmittalDetailDrawer
        projectId={projectId}
        submittalId={selectedSubmittalId}
        onClose={() => setSelectedSubmittalId(null)}
        onUpdated={() => void submittalsQuery.refetch()}
      />
    </>
    </ProjectModuleGate>
  );
}
