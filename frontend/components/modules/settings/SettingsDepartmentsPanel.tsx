'use client';

import { useState } from 'react';
import { Button, Form, Input, Modal, Switch } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import {
  useCreateDepartment,
  useDepartments,
  useUpdateDepartment,
  type DepartmentRow,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DepartmentFormValues {
  name: string;
  nameZh?: string;
  code: string;
  leaderUserId?: string;
  isActive: boolean;
  forceAlignLeaderDepartment?: boolean;
}

export default function SettingsDepartmentsPanel(): React.ReactNode {
  const [form] = Form.useForm<DepartmentFormValues>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [alignConfirm, setAlignConfirm] = useState(false);
  const messageApi = useAppMessage();
  const departmentsQuery = useDepartments({ page: 1, limit: 100 });
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const departments = departmentsQuery.data?.data ?? [];

  const columns: ColumnsType<DepartmentRow> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Code', dataIndex: 'code', key: 'code', width: 90 },
    { title: 'Chinese name', dataIndex: 'nameZh', key: 'nameZh', render: (v: string | null) => v ?? '-' },
    {
      title: 'Leader',
      key: 'leader',
      render: (_v, record) =>
        record.leaderUserId ? (
          <span className="text-[12px]">Assigned</span>
        ) : (
          <StatusBadge label="No leader assigned" variant="warning" />
        ),
    },
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
      title: '',
      key: 'actions',
      render: (_v, record) => (
        <Button type="link" className="!px-0" onClick={() => openEditor(record)}>
          Edit
        </Button>
      ),
    },
  ];

  function openEditor(record: DepartmentRow | null): void {
    setEditing(record);
    setAlignConfirm(false);
    setOpen(true);
    if (record) {
      form.setFieldsValue({
        name: record.name,
        nameZh: record.nameZh ?? undefined,
        code: record.code,
        leaderUserId: record.leaderUserId ?? undefined,
        isActive: record.isActive,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ isActive: true });
    }
  }

  async function handleSubmit(values: DepartmentFormValues): Promise<void> {
    if (!values.leaderUserId) {
      messageApi.warning('Department leader is required');
      return;
    }

    const body = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() || undefined,
      code: values.code.trim().toUpperCase(),
      leaderUserId: values.leaderUserId,
      isActive: values.isActive,
      forceAlignLeaderDepartment: alignConfirm || values.forceAlignLeaderDepartment,
    };

    try {
      if (editing) {
        await updateDepartment.mutateAsync({ id: editing.id, body });
        messageApi.success('Department updated');
      } else {
        await createDepartment.mutateAsync(body);
        messageApi.success('Department created');
      }
      setOpen(false);
      setEditing(null);
      setAlignConfirm(false);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('different department')
      ) {
        setAlignConfirm(true);
        messageApi.warning(
          'Leader belongs to another department — save again to align.',
        );
        return;
      }
      notifyApiError(
        error,
        editing ? 'Failed to update department' : 'Failed to create department',
        messageApi,
      );
    }
  }

  return (
    <FormLayout
      title="Departments"
      extra={
        <Button type="primary" size="small" onClick={() => openEditor(null)}>
          Add department
        </Button>
      }
    >
      <DataTable<DepartmentRow>
        rowKey="id"
        columns={columns}
        dataSource={departments}
        loading={departmentsQuery.isLoading}
        locale={{ emptyText: 'No departments defined' }}
      />

      <Modal
        open={open}
        title={editing ? 'Edit department' : 'Add department'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          setAlignConfirm(false);
        }}
        onOk={() => form.submit()}
        confirmLoading={createDepartment.isPending || updateDepartment.isPending}
        destroyOnHidden
        width={560}
      >
        <Form<DepartmentFormValues>
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
          <Form.Item
            label="Code"
            name="code"
            rules={[{ required: true, message: 'Code is required' }]}
          >
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item
            label="Department leader"
            name="leaderUserId"
            rules={[{ required: true, message: 'Leader is required' }]}
          >
            <UserSelect placeholder="Select leader" />
          </Form.Item>
          <Form.Item label="Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </FormLayout>
  );
}
