'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Switch } from 'antd';
import {
  useCreateEngineeringDiscipline,
  useUpdateEngineeringDiscipline,
  type EngineeringDiscipline,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DisciplineFormValues {
  name: string;
  nameZh?: string;
  isActive: boolean;
}

export default function DisciplineCatalogFormDrawer({
  open,
  editing,
  readOnly,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: EngineeringDiscipline | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DisciplineFormValues>();
  const messageApi = useAppMessage();
  const createDiscipline = useCreateEngineeringDiscipline();
  const updateDiscipline = useUpdateEngineeringDiscipline();

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        nameZh: editing.nameZh ?? undefined,
        isActive: editing.isActive,
      });
      return;
    }
    form.resetFields();
    form.setFieldsValue({ isActive: true });
  }, [editing, form, open]);

  async function handleSubmit(values: DisciplineFormValues): Promise<void> {
    try {
      if (editing) {
        await updateDiscipline.mutateAsync({
          id: editing.id,
          body: {
            name: values.name.trim(),
            nameZh: values.nameZh?.trim() || undefined,
            isActive: values.isActive,
          },
        });
        messageApi.success('Discipline updated');
      } else {
        await createDiscipline.mutateAsync({
          name: values.name.trim(),
          nameZh: values.nameZh?.trim() || undefined,
          isActive: values.isActive,
        });
        messageApi.success('Discipline created');
      }
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        editing ? 'Failed to update discipline' : 'Failed to create discipline',
        messageApi,
      );
    }
  }

  return (
    <Drawer
      open={open}
      title={readOnly ? 'View discipline' : editing ? 'Edit discipline' : 'Add discipline'}
      width={480}
      onClose={onClose}
      destroyOnHidden
      extra={
        readOnly ? null : (
          <Button
            type="primary"
            loading={createDiscipline.isPending || updateDiscipline.isPending}
            onClick={() => form.submit()}
          >
            Save
          </Button>
        )
      }
    >
      <Form<DisciplineFormValues>
        form={form}
        layout="vertical"
        disabled={readOnly}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Name (Chinese)" name="nameZh">
          <Input />
        </Form.Item>
        <Form.Item label="Active" name="isActive" valuePropName="checked">
          <Switch disabled={readOnly} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
