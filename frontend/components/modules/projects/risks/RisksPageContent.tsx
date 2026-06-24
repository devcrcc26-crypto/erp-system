// UI polish pass — styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ShieldAlert } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
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
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCreateRisk, useRisks } from '@/lib/query/risks';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRiskCategory,
  formatRiskStatus,
  riskScoreVariant,
  riskStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import RiskDetailDrawer from '@/components/modules/projects/risks/RiskDetailDrawer';

const CATEGORY_OPTIONS: { value: RiskCategory; label: string }[] = [
  { value: 'COST', label: 'Cost' },
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'ENVIRONMENTAL', label: 'Environmental' },
  { value: 'CONTRACTUAL', label: 'Contractual' },
];

const STATUS_OPTIONS: { value: RiskStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'MONITORING', label: 'Monitoring' },
  { value: 'MITIGATED', label: 'Mitigated' },
  { value: 'CLOSED', label: 'Closed' },
];

interface RiskFormValues {
  riskIdCode: string;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  ownerId: string;
  mitigationPlan?: string;
  contingencyPlan?: string;
  reviewDate?: Dayjs;
}

function RiskFormDrawer({
  open,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<RiskFormValues>();
  const createRisk = useCreateRisk();
  const messageApi = useAppMessage();
  const probability = Form.useWatch('probability', form) ?? 1;
  const impact = Form.useWatch('impact', form) ?? 1;

  async function handleSubmit(values: RiskFormValues): Promise<void> {
    try {
      await createRisk.mutateAsync({
        projectId,
        body: {
          riskIdCode: values.riskIdCode.trim(),
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          category: values.category,
          probability: values.probability,
          impact: values.impact,
          ownerId: values.ownerId,
          mitigationPlan: values.mitigationPlan?.trim() || undefined,
          contingencyPlan: values.contingencyPlan?.trim() || undefined,
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
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Risk ID"
            name="riskIdCode"
            rules={[{ required: true, message: 'Risk ID is required' }]}
          >
            <Input placeholder="R-001" />
          </Form.Item>
          <Form.Item
            label="Category"
            name="category"
            rules={[{ required: true }]}
          >
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item
          label="Owner"
          name="ownerId"
          rules={[{ required: true, message: 'Owner is required' }]}
        >
          <UserSelect />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
          <Form.Item
            label="Probability (1–5)"
            name="probability"
            rules={[{ required: true }]}
          >
            <InputNumber className="!w-full" min={1} max={5} />
          </Form.Item>
          <Form.Item
            label="Impact (1–5)"
            name="impact"
            rules={[{ required: true }]}
          >
            <InputNumber className="!w-full" min={1} max={5} />
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
        <Form.Item label="Mitigation plan" name="mitigationPlan">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Contingency plan" name="contingencyPlan">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Review date" name="reviewDate">
          <DatePicker className="w-full" />
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RiskStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);

  const resolveUserName = useUserNameLookup();
  const query = useRisks(projectId, {
    ...params,
    search: search.trim() || undefined,
    status: statusFilter,
  });

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
        render: (userId: string) => resolveUserName(userId),
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
    ],
    [resolveUserName],
  );

  if (query.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
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

        <Space wrap className="!mb-4">
          <Input.Search
            allowClear
            placeholder="Search risks"
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
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value: RiskStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
          />
        </Space>

        <DataTable<Risk>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
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
        onSaved={() => void query.refetch()}
      />

      <RiskDetailDrawer
        projectId={projectId}
        riskId={selectedRiskId}
        onClose={() => setSelectedRiskId(null)}
        onUpdated={() => void query.refetch()}
      />
    </>
  );
}
