'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import type { Milestone } from '@/lib/api/project-management.types';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useUpdateMilestone,
} from '@/lib/query/schedule';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface MilestoneFormValues {
  name: string;
  plannedDate?: Dayjs;
  actualDate?: Dayjs;
  status?: string;
}

function MilestoneFormDrawer({
  open,
  milestone,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  milestone?: Milestone;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<MilestoneFormValues>();
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const messageApi = useAppMessage();
  const isEditing = Boolean(milestone);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (milestone) {
      form.setFieldsValue({
        name: milestone.name,
        plannedDate: milestone.plannedDate
          ? dayjs(milestone.plannedDate)
          : undefined,
        actualDate: milestone.actualDate
          ? dayjs(milestone.actualDate)
          : undefined,
        status: milestone.status,
      });
      return;
    }

    form.resetFields();
  }, [open, milestone, form]);

  async function handleSubmit(values: MilestoneFormValues): Promise<void> {
    const body = {
      name: values.name.trim(),
      plannedDate: values.plannedDate?.toISOString(),
      actualDate: values.actualDate?.toISOString(),
      status: values.status?.trim() || undefined,
    };

    try {
      if (milestone) {
        await updateMilestone.mutateAsync({
          projectId,
          milestoneId: milestone.id,
          body,
        });
        messageApi.success('Milestone updated successfully');
      } else {
        await createMilestone.mutateAsync({ projectId, body });
        messageApi.success('Milestone created successfully');
      }
      form.resetFields();
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        milestone ? 'Failed to update milestone' : 'Failed to create milestone',
        messageApi,
      );
    }
  }

  return (
    <Drawer
      open={open}
      title={isEditing ? 'Edit milestone' : 'Add milestone'}
      onClose={onClose}
    >
      <Form<MilestoneFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: MilestoneFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Planned date" name="plannedDate">
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="Actual date" name="actualDate">
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="Status" name="status">
          <Input placeholder="e.g. On track" />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createMilestone.isPending || updateMilestone.isPending}
          >
            Save
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}

export default function MilestonesPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);

  const milestonesQuery = useMilestones(projectId);
  const deleteMilestone = useDeleteMilestone();
  const messageApi = useAppMessage();
  const milestones = milestonesQuery.data?.data ?? [];

  const columns: ColumnsType<Milestone> = [
    { title: 'Milestone', dataIndex: 'name', key: 'name' },
    {
      title: 'Planned',
      dataIndex: 'plannedDate',
      key: 'plannedDate',
      render: (value: string | null) => formatProjectDate(value),
    },
    {
      title: 'Actual',
      dataIndex: 'actualDate',
      key: 'actualDate',
      render: (value: string | null) => formatProjectDate(value),
    },
    {
      title: 'Variance',
      key: 'variance',
      render: (_value, record) => {
        if (!record.plannedDate || !record.actualDate) {
          return '—';
        }
        const planned = new Date(record.plannedDate).getTime();
        const actual = new Date(record.actualDate).getTime();
        const days = Math.round((actual - planned) / 86_400_000);
        if (days === 0) {
          return <Tag color="green">On time</Tag>;
        }
        return (
          <Tag color={days > 0 ? 'red' : 'blue'}>
            {days > 0 ? `${days}d late` : `${Math.abs(days)}d early`}
          </Tag>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <StatusBadge label={status} variant="default" />,
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_value, record) => (
        <div className="flex gap-2">
          <Button
            type="link"
            className="!px-0"
            onClick={() => {
              setEditing(record);
              setDrawerOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            type="link"
            danger
            className="!px-0"
            onClick={() => setDeleting(record)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <FormLayout
        title="Milestones"
        description="Key project milestones with planned versus actual dates."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            Add milestone
          </Button>
        }
      >
        <DataTable<Milestone>
          rowKey="id"
          columns={columns}
          dataSource={milestones}
          locale={{ emptyText: 'No milestones defined' }}
        />
      </FormLayout>

      <MilestoneFormDrawer
        open={drawerOpen}
        milestone={editing ?? undefined}
        projectId={projectId}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        onSaved={() => void milestonesQuery.refetch()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete milestone"
        description={`Remove "${deleting?.name}" from the schedule?`}
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMilestone.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteMilestone
            .mutateAsync({ projectId, milestoneId: deleting.id })
            .then(() => {
              messageApi.success('Milestone deleted successfully');
              setDeleting(null);
              void milestonesQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to delete milestone', messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
