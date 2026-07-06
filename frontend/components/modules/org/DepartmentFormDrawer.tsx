'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Switch } from 'antd';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import {
  useCreateDepartment,
  useUpdateDepartment,
  type DepartmentRow,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DepartmentFormValues {
  name: string;
  nameZh?: string;
  code?: string;
  leaderUserId?: string;
  isActive: boolean;
  forceAlignLeaderDepartment?: boolean;
}

function deriveDepartmentCode(name: string): string {
  const compact = name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  return compact.slice(0, 8) || 'DEPT';
}

export default function DepartmentFormDrawer({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: DepartmentRow | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DepartmentFormValues>();
  const [alignConfirmOpen, setAlignConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<DepartmentFormValues | null>(
    null,
  );
  const messageApi = useAppMessage();
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        nameZh: editing.nameZh ?? undefined,
        code: editing.code,
        leaderUserId: editing.leaderUserId ?? undefined,
        isActive: editing.isActive,
      });
      return;
    }
    form.resetFields();
    form.setFieldsValue({ isActive: true });
  }, [editing, form, open]);

  function resetAndClose(): void {
    form.resetFields();
    setPendingValues(null);
    setAlignConfirmOpen(false);
    onClose();
  }

  async function submitValues(
    values: DepartmentFormValues,
    forceAlign = false,
  ): Promise<void> {
    if (!values.leaderUserId) {
      messageApi.warning('Department leader is required');
      return;
    }

    const body = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() || undefined,
      code: (values.code ?? deriveDepartmentCode(values.name)).trim().toUpperCase(),
      leaderUserId: values.leaderUserId,
      isActive: values.isActive,
      forceAlignLeaderDepartment: forceAlign || values.forceAlignLeaderDepartment,
    };

    try {
      if (editing) {
        await updateDepartment.mutateAsync({ id: editing.id, body });
        messageApi.success('Department updated');
      } else {
        await createDepartment.mutateAsync(body);
        messageApi.success('Department created');
      }
      onSaved();
      resetAndClose();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('different department')
      ) {
        setPendingValues(values);
        setAlignConfirmOpen(true);
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
    <>
      <Drawer
        open={open}
        title={editing ? 'Edit department' : 'Add department'}
        width={560}
        onClose={resetAndClose}
        destroyOnHidden
        extra={
          <Button
            type="primary"
            loading={createDepartment.isPending || updateDepartment.isPending}
            onClick={() => form.submit()}
          >
            Save
          </Button>
        }
      >
        <Form<DepartmentFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => void submitValues(values)}
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
          {!editing ? (
            <Form.Item
              label="Code"
              name="code"
              tooltip="Auto-generated from name if left blank"
            >
              <Input placeholder="Auto" />
            </Form.Item>
          ) : null}
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
      </Drawer>

      <ConfirmDialog
        open={alignConfirmOpen}
        title="Align leader department?"
        description={
          pendingValues
            ? `Set this user's department to "${pendingValues.name}"?`
            : undefined
        }
        confirmLabel="Align and save"
        confirmLoading={createDepartment.isPending || updateDepartment.isPending}
        onConfirm={() => {
          if (!pendingValues) {
            return;
          }
          void submitValues(
            { ...pendingValues, forceAlignLeaderDepartment: true },
            true,
          );
        }}
        onCancel={() => {
          setAlignConfirmOpen(false);
          setPendingValues(null);
        }}
      />
    </>
  );
}
