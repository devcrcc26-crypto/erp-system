'use client';

import { useState } from 'react';
import { Button, Form, Input, Modal, Switch } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import {
  useCreateEngineeringDiscipline,
  useEngineeringDisciplines,
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

export default function SettingsDisciplinesPanel(): React.ReactNode {
  const [form] = Form.useForm<DisciplineFormValues>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EngineeringDiscipline | null>(null);
  const messageApi = useAppMessage();
  const disciplinesQuery = useEngineeringDisciplines({
    page: 1,
    limit: 200,
    activeOnly: false,
  });
  const createDiscipline = useCreateEngineeringDiscipline();
  const updateDiscipline = useUpdateEngineeringDiscipline();
  const disciplines = disciplinesQuery.data?.data ?? [];

  const columns: ColumnsType<EngineeringDiscipline> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Chinese name', dataIndex: 'nameZh', key: 'nameZh', render: (v: string | null) => v ?? '-' },
    {
      title: 'Status',
      key: 'isActive',
      render: (_v, record) => (
        <StatusBadge
          label={record.isActive ? 'Active' : 'Inactive'}
          variant={record.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      title: 'In use',
      key: 'usage',
      render: (_v, record) => {
        const count =
          (record._count?.taskDisciplines ?? 0) + (record._count?.users ?? 0);
        return count > 0 ? `${count} reference(s)` : '-';
      },
    },
    {
      title: '',
      key: 'actions',
      render: (_v, record) => (
        <Button type="link" className="!px-0" onClick={() => openEditor(record)}>
          Edit
        </Button>
      ),
    },
  ];

  function openEditor(record: EngineeringDiscipline | null): void {
    setEditing(record);
    setOpen(true);
    if (record) {
      form.setFieldsValue({
        name: record.name,
        nameZh: record.nameZh ?? undefined,
        isActive: record.isActive,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ isActive: true });
    }
  }

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
      setOpen(false);
      setEditing(null);
    } catch (error) {
      notifyApiError(
        error,
        editing ? 'Failed to update discipline' : 'Failed to create discipline',
        messageApi,
      );
    }
  }

  return (
    <FormLayout
      title="Engineering disciplines"
      extra={
        <Button type="primary" size="small" onClick={() => openEditor(null)}>
          Add discipline
        </Button>
      }
    >
      <DataTable<EngineeringDiscipline>
        rowKey="id"
        columns={columns}
        dataSource={disciplines}
        loading={disciplinesQuery.isLoading}
        locale={{ emptyText: 'No disciplines defined' }}
      />

      <Modal
        open={open}
        title={editing ? 'Edit discipline' : 'Add discipline'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={createDiscipline.isPending || updateDiscipline.isPending}
        destroyOnHidden
      >
        <Form<DisciplineFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Chinese name" name="nameZh">
            <Input />
          </Form.Item>
          <Form.Item label="Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          {editing &&
            ((editing._count?.taskDisciplines ?? 0) > 0 ||
              (editing._count?.users ?? 0) > 0) && (
              <p className="text-[12px] text-gray-500">
                Referenced disciplines cannot be deleted - deactivate to hide from
                dropdowns.
              </p>
            )}
        </Form>
      </Modal>
    </FormLayout>
  );
}
