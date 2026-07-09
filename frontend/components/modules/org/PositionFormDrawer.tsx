'use client';

import { useEffect } from 'react';
import { Button, Drawer, Form, Input, Select, Switch } from 'antd';
import {
  useCreatePosition,
  useDepartments,
  useUpdatePosition,
  type Position,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PositionFormValues {
  departmentId: string;
  title: string;
  grade?: string;
  isActive: boolean;
}

export default function PositionFormDrawer({
  open,
  editing,
  readOnly,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Position | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<PositionFormValues>();
  const messageApi = useAppMessage();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, open);
  const departmentOptions = (departmentsQuery.data?.data ?? []).map((department) => ({
    value: department.id,
    label: department.name,
  }));

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        departmentId: editing.departmentId,
        title: editing.title,
        grade: editing.grade ?? undefined,
        isActive: editing.isActive,
      });
      return;
    }
    form.resetFields();
    form.setFieldsValue({ isActive: true });
  }, [editing, form, open]);

  async function handleSubmit(values: PositionFormValues): Promise<void> {
    try {
      if (editing) {
        await updatePosition.mutateAsync({
          id: editing.id,
          body: {
            departmentId: values.departmentId,
            title: values.title.trim(),
            grade: values.grade?.trim() || undefined,
            isActive: values.isActive,
          },
        });
        messageApi.success('Position updated');
      } else {
        await createPosition.mutateAsync({
          departmentId: values.departmentId,
          title: values.title.trim(),
          grade: values.grade?.trim() || undefined,
          isActive: values.isActive,
        });
        messageApi.success('Position created');
      }
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        editing ? 'Failed to update position' : 'Failed to create position',
        messageApi,
      );
    }
  }

  return (
    <Drawer
      open={open}
      title={readOnly ? 'View position' : editing ? 'Edit position' : 'Add position'}
      width={480}
      onClose={onClose}
      destroyOnHidden
      extra={
        readOnly ? null : (
          <Button
            type="primary"
            loading={createPosition.isPending || updatePosition.isPending}
            onClick={() => form.submit()}
          >
            Save
          </Button>
        )
      }
    >
      <Form<PositionFormValues>
        form={form}
        layout="vertical"
        disabled={readOnly}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="Department"
          name="departmentId"
          rules={[{ required: true, message: 'Department is required' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={departmentsQuery.isLoading}
            placeholder="Select department"
            options={departmentOptions}
          />
        </Form.Item>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Grade" name="grade">
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item label="Active" name="isActive" valuePropName="checked">
          <Switch disabled={readOnly} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
