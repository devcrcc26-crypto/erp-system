'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Send } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Submittal,
  SubmittalPurpose,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { useMySubmittals } from '@/lib/query/submittals';
import { formatProjectDate } from '@/lib/utils/project-display';
import { submittalStatusVariant } from '@/lib/utils/pm-status-display';
import { formatExternalReleasePurpose } from '@/lib/utils/external-release-purpose';
import { formatSubmittalItemCodesSummary } from '@/lib/utils/submittal-display';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import SubmittalPackageDrawer from '@/components/modules/projects/submittals/SubmittalPackageDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewExternalReleases,
  useEpcCapabilities,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const EXTERNAL_PURPOSES: SubmittalPurpose[] = [
  'DISCIPLINE_SITE',
  'DISCIPLINE_CONSULTANT',
];

/**
 * Global external releases list — cross-project, current-user relevant only.
 */
export default function GlobalExternalReleasesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [selected, setSelected] = useState<{
    projectId: string;
    submittalId: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const capabilitiesReady = !usePermissionsLoading();
  const canViewExternalReleases = useCanViewExternalReleases();
  const epc = useEpcCapabilities();
  const canCreate = epc.navDisciplineLeader || epc.navDesigner;

  const submittalsQuery = useMySubmittals(
    {
      ...params,
      search: search.trim() || undefined,
      status: statusFilter,
      submittalPurpose: EXTERNAL_PURPOSES.join(','),
    },
    capabilitiesReady && canViewExternalReleases,
  );

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: 'Release #',
        dataIndex: 'submittalNumber',
        key: 'submittalNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() =>
              setSelected({
                projectId: record.projectId,
                submittalId: record.id,
              })
            }
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
        title: 'Subtasks',
        key: 'subtasks',
        render: (_value: unknown, record) =>
          formatSubmittalItemCodesSummary(record.items),
      },
      {
        title: 'Recipient',
        dataIndex: 'submittalPurpose',
        key: 'submittalPurpose',
        render: (value: SubmittalPurpose | null) =>
          formatExternalReleasePurpose(value),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: SubmittalStatus) => (
          <StatusBadge
            label={status === 'DRAFT' ? 'Draft' : 'Issued'}
            variant={submittalStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Issued date',
        dataIndex: 'issuedAt',
        key: 'issuedAt',
        render: (value: string | null) => formatProjectDate(value),
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: Submittal) => {
          const code = record.projectCode?.trim();
          const name = record.projectName?.trim();
          if (code && name) {
            return `${code} — ${name}`;
          }
          return name || code || '-';
        },
      },
    ],
    [],
  );

  if (!capabilitiesReady || submittalsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewExternalReleases) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalExternalReleases.noAccess')}
      />
    );
  }

  const apiUnavailable =
    submittalsQuery.isError &&
    submittalsQuery.error instanceof ApiRequestError &&
    (submittalsQuery.error.status === 404 || submittalsQuery.error.status === 0);

  const submittals = submittalsQuery.data?.data ?? [];
  const meta = submittalsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title={t('pages.globalExternalReleases.title')}
        description={t('pages.globalExternalReleases.description')}
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setDrawerOpen(true)}
              disabled={apiUnavailable}
            >
              New external release
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="External release APIs are not connected yet."
            description="This page is ready - data will appear when the backend is available."
          />
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search external releases"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
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
            options={[
              { value: 'DRAFT', label: 'Draft' },
              { value: 'SUBMITTED', label: 'Issued' },
            ]}
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
                title={t('pages.globalExternalReleases.empty')}
                description="External releases you created, or that belong to disciplines you lead, appear here."
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'New external release',
                        onClick: () => setDrawerOpen(true),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <SubmittalPackageDrawer
        open={drawerOpen}
        showProjectSelector
        onClose={() => setDrawerOpen(false)}
        onCreated={(submittalId) => {
          void submittalsQuery.refetch().then((result) => {
            const created = result.data?.data.find((s) => s.id === submittalId);
            if (created) {
              setSelected({
                projectId: created.projectId,
                submittalId: created.id,
              });
            }
          });
          setDrawerOpen(false);
        }}
      />

      {selected && (
        <SubmittalDetailDrawer
          projectId={selected.projectId}
          submittalId={selected.submittalId}
          onClose={() => setSelected(null)}
          onUpdated={() => void submittalsQuery.refetch()}
        />
      )}
    </>
  );
}
