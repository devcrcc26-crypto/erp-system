// Gap completion - new

'use client';

import { useMemo } from 'react';
import { Button, DatePicker, Drawer, Form, Input, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useCreateDeliverable } from '@/lib/query/deliverables';
import { useDesignPackages } from '@/lib/query/design-packages';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { standardDetailDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';

interface FormValues {
  name: string;
  dueDate?: Dayjs;
  taskDisciplineId?: string;
  designPackageId?: string;
}

export default function CreateDeliverableDrawer({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<FormValues>();
  const createMutation = useCreateDeliverable(projectId);
  const messageApi = useAppMessage();
  const disciplinesQuery = useProjectDisciplines(projectId, open);
  const taskDisciplineId = Form.useWatch('taskDisciplineId', form) as
    | string
    | undefined;

  const packagesQuery = useDesignPackages(
    projectId,
    taskDisciplineId ?? '',
    Boolean(taskDisciplineId) && open,
  );

  const disciplineOptions = useMemo(
    () =>
      (disciplinesQuery.data ?? []).map((row) => ({
        value: row.id,
        label: formatDisciplineLabel(row.disciplineIndex),
      })),
    [disciplinesQuery.data],
  );

  const packageOptions = useMemo(
    () =>
      (packagesQuery.data ?? []).map((pkg) => ({
        value: pkg.id,
        label: pkg.name,
      })),
    [packagesQuery.data],
  );

  async function handleSubmit(values: FormValues): Promise<void> {
    try {
      await createMutation.mutateAsync({
        name: values.name.trim(),
        dueDate: values.dueDate?.toISOString(),
        taskDisciplineId: values.taskDisciplineId,
        designPackageId: values.designPackageId,
      });
      messageApi.success('Deliverable created');
      form.resetFields();
      onCreated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create deliverable', messageApi);
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      open={open}
      title="New deliverable"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="Title"
          name="name"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Deliverable name" />
        </Form.Item>
        <Form.Item label="Planned date" name="dueDate">
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="Discipline" name="taskDisciplineId">
          <Select
            allowClear
            placeholder="Select discipline"
            loading={disciplinesQuery.isLoading}
            options={disciplineOptions}
            onChange={() => form.setFieldValue('designPackageId', undefined)}
          />
        </Form.Item>
        <Form.Item label="Subtask" name="designPackageId">
          <Select
            allowClear
            placeholder="Select subtask"
            disabled={!taskDisciplineId}
            loading={packagesQuery.isLoading}
            options={packageOptions}
          />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createMutation.isPending}
          >
            Create
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}
