// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Space,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ShieldAlert } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Risk,
  RiskCategory,
  RiskStatus,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCreateRisk, useRisks } from '@/lib/query/risks';
import { useAllProjects } from '@/lib/query/projects';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  RISK_IMPACT_OPTIONS,
  RISK_LIKELIHOOD_OPTIONS,
  formatRiskCategory,
  formatRiskStatus,
  riskScoreVariant,
  riskStatusVariant,
} from '@/lib/utils/pm-status-display';
import { RISK_WORKFLOW } from '@/lib/api/workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import RiskDetailDrawer from '@/components/modules/projects/risks/RiskDetailDrawer';
import RiskMatrix, {
  matchesRiskMatrixCell,
  type RiskMatrixCell,
} from '@/components/modules/projects/risks/RiskMatrix';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { RISK_CATEGORY_OPTIONS as CATEGORY_OPTIONS } from '@/lib/constants/risk-options';

const STATUS_OPTIONS = RISK_WORKFLOW.map((step) => ({
  value: step.key as RiskStatus,
  label: step.label,
}));

interface RiskFormValues {
  title: string;
  category: RiskCategory;
  description: string;
  probability: number;
  impact: number;
  contingencyPlan?: string;
  ownerId: string;
  reviewDate?: Dayjs;
}

export function RiskFormDrawer({
  open,
  projectId: projectIdProp,
  showProjectSelector = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId?: string;
  showProjectSelector?: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<RiskFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';
  const createRisk = useCreateRisk();
  const messageApi = useAppMessage();
  const probability = Form.useWatch('probability', form) ?? 1;
  const impact = Form.useWatch('impact', form) ?? 1;

  const projectsQuery = useAllProjects({}, open && showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  useEffect(() => {
    if (!open) {
      form.resetFields();
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  async function handleSubmit(values: RiskFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    try {
      await createRisk.mutateAsync({
        projectId: effectiveProjectId,
        body: {
          title: values.title.trim(),
          category: values.category,
          description: values.description.trim(),
          probability: values.probability,
          impact: values.impact,
          contingencyPlan: values.contingencyPlan?.trim() || undefined,
          ownerId: values.ownerId,
          reviewDate: values.reviewDate?.format('YYYY-MM-DD'),
        },
      });
      messageApi.success('Risk created');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create risk', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="New risk"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<RiskFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ category: 'SCHEDULE', probability: 3, impact: 3 }}
        onFinish={(values: RiskFormValues) => void handleSubmit(values)}
      >
        {showProjectSelector && (
          <Form.Item label="Project" required>
            <Select
              showSearch
              placeholder="Select project"
              options={projectOptions}
              loading={projectsQuery.isLoading}
              optionFilterProp="label"
              value={selectedProjectId ?? undefined}
              onChange={(value: string) => setSelectedProjectId(value)}
            />
          </Form.Item>
        )}
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Category" name="category" rules={[{ required: true }]}>
          <Select options={CATEGORY_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'Description is required' }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
          <Form.Item label="Likelihood" name="probability" rules={[{ required: true }]}>
            <Select options={RISK_LIKELIHOOD_OPTIONS} />
          </Form.Item>
          <Form.Item label="Impact" name="impact" rules={[{ required: true }]}>
            <Select options={RISK_IMPACT_OPTIONS} />
          </Form.Item>
          <Form.Item label="Risk score">
            <div className="flex h-8 items-center">
              <StatusBadge
                label={String(probability * impact)}
                variant={riskScoreVariant(probability * impact)}
              />
            </div>
          </Form.Item>
        </div>
        <Form.Item
          label="Owner"
          name="ownerId"
          rules={[{ required: true, message: 'Owner is required' }]}
        >
          <UserSelect />
        </Form.Item>
        <Form.Item label="Review date" name="reviewDate" extra="When to next review this risk">
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="Contingency plan" name="contingencyPlan">
          <Input.TextArea rows={2} />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={createRisk.isPending}>
            Create risk
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function RisksPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RiskStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [matrixVisible, setMatrixVisible] = useState(true);
  const [selectedCell, setSelectedCell] = useState<RiskMatrixCell | null>(null);

  useEffect(() => {
    const riskIdParam = searchParams.get('riskId');
    if (riskIdParam) {
      setSelectedRiskId(riskIdParam);
      router.replace(`/projects/${projectId}/risks`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const resolveUserDisplay = useUserDisplayResolver();
  const query = useRisks(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  });

  // Full set for matrix counts + cell-click filtering (API max limit is 100).
  const matrixQuery = useRisks(
    projectId,
    { page: 1, limit: 100 },
    matrixVisible,
  );

  const matrixRisks = matrixQuery.data?.data ?? [];
  const tableRows = useMemo(() => {
    const rows = query.data?.data ?? [];
    if (!selectedCell) {
      return rows;
    }
    return matrixRisks.filter((risk) => matchesRiskMatrixCell(risk, selectedCell));
  }, [query.data?.data, matrixRisks, selectedCell]);

  const columns: ColumnsType<Risk> = useMemo(
    () => [
      {
        title: 'Risk #',
        dataIndex: 'riskIdCode',
        key: 'riskIdCode',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedRiskId(record.id)}
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
        render: (value: RiskCategory) => formatRiskCategory(value),
      },
      {
        title: 'Score',
        dataIndex: 'riskScore',
        key: 'riskScore',
        render: (score: number) => (
          <StatusBadge
            label={String(score)}
            variant={riskScoreVariant(score)}
          />
        ),
      },
      {
        title: 'Owner',
        dataIndex: 'ownerId',
        key: 'ownerId',
        render: (_: unknown, record: Risk) =>
          resolveUserDisplay(record.ownerId, record.ownerName),
      },
      {
        title: 'Review',
        dataIndex: 'reviewDate',
        key: 'reviewDate',
        render: (value: string | null) => formatProjectDate(value),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: RiskStatus) => (
          <StatusBadge
            label={formatRiskStatus(status)}
            variant={riskStatusVariant(status)}
          />
        ),
      },
      {
        title: '',
        key: 'open',
        width: 70,
        render: (_: unknown, record: Risk) => (
          <Button
            type="link"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${projectId}/risks/${record.id}`);
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [resolveUserDisplay, router, projectId],
  );

  if (query.isLoading) {
    return <PageLoadingSkeleton />;
  }

  return (
    <ProjectModuleGate projectId={projectId} module="risks">
    <>
      <FormLayout
        title="Risk register"
        description="Project risks with probability-impact scoring and mitigation plans."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            New risk
          </Button>
        }
      >
        {query.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load risks"
            description={
              query.error instanceof ApiRequestError
                ? query.error.message
                : 'Please try again.'
            }
          />
        )}

        <div className="!mb-4 flex items-center justify-between">
          <h3 className={layout.drawerHeading}>Risk matrix</h3>
          <Button
            size="small"
            onClick={() => setMatrixVisible((v) => !v)}
          >
            {matrixVisible ? 'Hide Matrix' : 'Show Matrix'}
          </Button>
        </div>
        {matrixVisible && (
          <div className={`!mb-4 ${layout.drawerSurface}`}>
            <RiskMatrix
              risks={matrixRisks}
              selectedCell={selectedCell}
              onCellClick={(cell) => {
                resetPage();
                setSelectedCell(cell);
              }}
            />
            {matrixQuery.isError && (
              <Alert
                type="warning"
                showIcon
                className="!mt-3"
                title="Unable to load risk matrix"
                description={
                  matrixQuery.error instanceof ApiRequestError
                    ? matrixQuery.error.message
                    : 'Matrix counts may be incomplete.'
                }
              />
            )}
          </div>
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search risks"
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
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value: RiskStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
          {selectedCell && (
            <Button size="small" onClick={() => setSelectedCell(null)}>
              Clear matrix filter
            </Button>
          )}
        </Space>

        <DataTable<Risk>
          rowKey="id"
          columns={columns}
          dataSource={tableRows}
          pagination={selectedCell ? false : bindMeta(query.data?.meta)}
          onRow={(record) => ({
            onClick: () => setSelectedRiskId(record.id),
            className: 'cursor-pointer',
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ShieldAlert />}
                title="No risks"
                description="Log project risks to track scoring, owners, and mitigation"
                action={{ label: 'New risk', onClick: () => setCreateOpen(true) }}
              />
            ),
          }}
        />
      </FormLayout>

      <RiskFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          void query.refetch();
          void matrixQuery.refetch();
        }}
      />

      <RiskDetailDrawer
        projectId={projectId}
        riskId={selectedRiskId}
        onClose={() => setSelectedRiskId(null)}
        onUpdated={() => {
          void query.refetch();
          void matrixQuery.refetch();
        }}
      />
    </>
    </ProjectModuleGate>
  );
}
