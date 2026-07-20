'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Modal, Select, Space } from 'antd';
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
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { SUBMITTAL_WORKFLOW } from '@/lib/api/workflow';
import { useMySubmittals } from '@/lib/query/submittals';
import { useMyWork } from '@/lib/query/epc-workspace';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSubmittalStatus,
  isOverdue,
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import ConstructionSubmittalDrawer from '@/components/modules/projects/submittals/ConstructionSubmittalDrawer';
import SubmittalDetailDrawer from '@/components/modules/projects/submittals/SubmittalDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import {
  useCanViewMyWork,
  useCanViewSubmittals,
  useEpcCapabilities,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Global construction submittals list — cross-project, current-user relevant only.
 */
export default function GlobalSubmittalsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | undefined>();
  const [selected, setSelected] = useState<{
    projectId: string;
    submittalId: string;
  } | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerProjectId, setPickerProjectId] = useState<string | null>(null);

  const capabilitiesReady = !usePermissionsLoading();
  const canViewSubmittals = useCanViewSubmittals();
  const canViewMyWork = useCanViewMyWork();
  const epc = useEpcCapabilities();
  const canCreate = epc.navDisciplineLeader || epc.navDesigner;
  const resolveUserDisplay = useUserDisplayResolver();

  const submittalsQuery = useMySubmittals(
    {
      ...params,
      search: search.trim() || undefined,
      status: statusFilter,
    },
    capabilitiesReady && canViewSubmittals,
  );

  const myWorkQuery = useMyWork(
    undefined,
    capabilitiesReady && canCreate && canViewMyWork,
  );

  const projects = useMemo(() => {
    const myWork = myWorkQuery.data ?? [];
    return Array.from(
      new Map(
        myWork.map((item) => [
          item.projectId,
          {
            id: item.projectId,
            name: item.projectName,
            code: item.projectNumber,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [myWorkQuery.data]);

  const columns: ColumnsType<Submittal> = useMemo(
    () => [
      {
        title: t('pages.globalSubmittals.projectName'),
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
      {
        title: 'Submittal #',
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
        render: (_: unknown, record: Submittal) =>
          resolveUserDisplay(record.assignedTo, record.assignedToName, '-'),
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
    [resolveUserDisplay, t],
  );

  function openProjectPicker(): void {
    setPickerProjectId(null);
    setProjectPickerOpen(true);
  }

  function handlePickerContinue(): void {
    if (!pickerProjectId) {
      return;
    }
    setSelectedProjectId(pickerProjectId);
    setProjectPickerOpen(false);
    setPickerProjectId(null);
    setDrawerOpen(true);
  }

  function closeCreateDrawer(): void {
    setDrawerOpen(false);
    setSelectedProjectId(null);
  }

  if (!capabilitiesReady || submittalsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewSubmittals) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalSubmittals.noAccess')}
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
        title={t('pages.globalSubmittals.title')}
        description={t('pages.globalSubmittals.description')}
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openProjectPicker}
              disabled={apiUnavailable}
            >
              New submittal
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Submittal APIs are not connected yet."
            description="This page is ready - data will appear when the backend is available."
          />
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search submittals"
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
                title={t('pages.globalSubmittals.empty')}
                description="Submittals assigned to you, raised by you, or in your disciplines appear here."
                action={
                  canCreate && !apiUnavailable
                    ? {
                        label: 'New submittal',
                        onClick: openProjectPicker,
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <Modal
        title="Select project"
        open={projectPickerOpen}
        onCancel={() => {
          setProjectPickerOpen(false);
          setPickerProjectId(null);
        }}
        onOk={handlePickerContinue}
        okText="Continue"
        okButtonProps={{ disabled: !pickerProjectId }}
        destroyOnHidden
      >
        <Select
          showSearch
          className="w-full"
          placeholder="Choose a project"
          value={pickerProjectId ?? undefined}
          onChange={(value: string) => setPickerProjectId(value)}
          loading={myWorkQuery.isLoading}
          optionFilterProp="label"
          options={projects.map((project) => ({
            value: project.id,
            label: project.code
              ? `${project.code} — ${project.name}`
              : project.name,
          }))}
          notFoundContent={
            myWorkQuery.isLoading
              ? 'Loading projects…'
              : 'No assigned projects found'
          }
        />
      </Modal>

      {selectedProjectId && (
        <ConstructionSubmittalDrawer
          open={drawerOpen}
          projectId={selectedProjectId}
          onClose={closeCreateDrawer}
          onCreated={(submittalId) => {
            void submittalsQuery.refetch();
            closeCreateDrawer();
            setSelected({ projectId: selectedProjectId, submittalId });
          }}
        />
      )}

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
