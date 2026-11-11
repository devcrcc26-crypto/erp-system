// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FileStack } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CreateDrawingRequest,
  Drawing,
} from '@/lib/api/project-management.types';
import { useCreateDrawing, useDrawings } from '@/lib/query/drawings';
import { formatProjectDate } from '@/lib/utils/project-display';
import DrawingDetailDrawer from '@/components/modules/projects/drawings/DrawingDetailDrawer';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DrawingFormValues {
  drawingNumber: string;
  title: string;
  discipline?: string;
  revision: string;
  status?: string;
}

function DrawingFormDrawer({
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
  const [form] = Form.useForm<DrawingFormValues>();
  const createDrawing = useCreateDrawing();
  const messageApi = useAppMessage();

  async function handleSubmit(values: DrawingFormValues): Promise<void> {
    const body: CreateDrawingRequest = {
      drawingNumber: values.drawingNumber.trim(),
      title: values.title.trim(),
      discipline: values.discipline?.trim() || undefined,
      revision: values.revision.trim(),
      status: values.status?.trim() || undefined,
    };
    try {
      await createDrawing.mutateAsync({ projectId, body });
      messageApi.success('Drawing registered successfully');
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to register drawing', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title="Register drawing"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<DrawingFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        initialValues={{ revision: 'A' }}
        onFinish={(values: DrawingFormValues) => void handleSubmit(values)}
      >
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item
            label="Drawing number"
            name="drawingNumber"
            rules={[{ required: true, message: 'Drawing number is required' }]}
          >
            <Input placeholder="e.g. A-101" />
          </Form.Item>
          <Form.Item
            label="Revision"
            name="revision"
            rules={[{ required: true, message: 'Revision is required' }]}
          >
            <Input placeholder="A" />
          </Form.Item>
        </div>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Drawing title" />
        </Form.Item>
        <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
          <Form.Item label="Discipline" name="discipline">
            <Input placeholder="e.g. Architectural" />
          </Form.Item>
          <Form.Item label="Status" name="status">
            <Input placeholder="e.g. Issued for construction" />
          </Form.Item>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createDrawing.isPending}
          >
            Register drawing
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function DrawingsPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(
    null,
  );

  const drawingsQuery = useDrawings(projectId, {
    ...params,
    search: search.trim() || undefined,
    discipline: disciplineFilter,
  });

  const columns: ColumnsType<Drawing> = useMemo(
    () => [
      {
        title: 'Number',
        dataIndex: 'drawingNumber',
        key: 'drawingNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            onClick={() => setSelectedDrawingId(record.id)}
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
        title: 'Discipline',
        dataIndex: 'discipline',
        key: 'discipline',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Revision',
        dataIndex: 'revision',
        key: 'revision',
        align: 'right',
        width: 80,
      },
      {
        title: 'Latest',
        dataIndex: 'isLatest',
        key: 'isLatest',
        width: 80,
        render: (isLatest: boolean) =>
          isLatest ? (
            <Tag color="green">Latest</Tag>
          ) : (
            <Tag>Superseded</Tag>
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => (
          <StatusBadge label={status} variant="default" />
        ),
      },
      {
        title: 'Issued',
        dataIndex: 'dateIssued',
        key: 'dateIssued',
        render: (value: string | null) => formatProjectDate(value),
      },
    ],
    [],
  );

  if (drawingsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  const apiUnavailable =
    drawingsQuery.isError &&
    drawingsQuery.error instanceof ApiRequestError &&
    (drawingsQuery.error.status === 404 || drawingsQuery.error.status === 0);

  const drawings = drawingsQuery.data?.data ?? [];
  const meta = drawingsQuery.data?.meta;

  const disciplineOptions = Array.from(
    new Set(
      drawings
        .map((drawing) => drawing.discipline)
        .filter((value): value is string => Boolean(value)),
    ),
  ).map((discipline) => ({ value: discipline, label: discipline }));

  return (
    <>
      <FormLayout
        title="Drawings"
        description="Drawing register with revision history and links to RFIs, submittals, and site records."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            disabled={apiUnavailable}
          >
            Register drawing
          </Button>
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Drawing APIs are not connected yet."
            description="This page is ready -data will appear when the project management backend module is available."
          />
        )}

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search drawings"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Discipline"
            className={layout.filterControlSm}
            value={disciplineFilter}
            onChange={(value: string | undefined) => {
              resetPage();
              setDisciplineFilter(value);
            }}
            options={disciplineOptions}
          />
        </Space>

        <DataTable<Drawing>
          rowKey="id"
          columns={columns}
          dataSource={drawings}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FileStack />}
                title="No drawings"
                description="Add drawing register entries"
                action={
                  !apiUnavailable
                    ? { label: 'Add drawing', onClick: () => setCreateOpen(true) }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <DrawingFormDrawer
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void drawingsQuery.refetch()}
      />

      <DrawingDetailDrawer
        projectId={projectId}
        drawingId={selectedDrawingId}
        onClose={() => setSelectedDrawingId(null)}
        onUpdated={() => void drawingsQuery.refetch()}
      />
    </>
  );
}
