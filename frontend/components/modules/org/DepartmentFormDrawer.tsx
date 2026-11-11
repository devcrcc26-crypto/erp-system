'use client';

import './org-v2.css';

import { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Switch } from 'antd';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import {
  useCreateDepartment,
  useUpdateDepartment,
  type DepartmentRow,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DepartmentFormValues {
  name: string;
  nameZh?: string;
  leaderUserId?: string;
  isActive: boolean;
  forceAlignLeaderDepartment?: boolean;
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
  const saving = createDepartment.isPending || updateDepartment.isPending;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        nameZh: editing.nameZh ?? undefined,
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
    const shared = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() || undefined,
      isActive: values.isActive,
      forceAlignLeaderDepartment: forceAlign || values.forceAlignLeaderDepartment,
    };

    try {
      if (editing) {
        await updateDepartment.mutateAsync({
          id: editing.id,
          body: {
            ...shared,
            leaderUserId: values.leaderUserId ?? null,
          },
        });
        messageApi.success('Department updated');
      } else {
        await createDepartment.mutateAsync({
          ...shared,
          ...(values.leaderUserId ? { leaderUserId: values.leaderUserId } : {}),
        });
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
        size={560}
        className="erp-responsive-drawer erp-org-drawer"
        rootClassName="erp-org-drawer"
        styles={detailDrawerStyles}
        onClose={resetAndClose}
        destroyOnHidden
        title={
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-snug">
              {editing ? 'Edit department' : 'Add department'}
            </div>
            <p className="erp-org-drawer-hint">
              {editing
                ? 'Update the department name, leader, or active status.'
                : 'Create a department. A code is assigned automatically on save.'}
            </p>
          </div>
        }
        footer={
          <div className="erp-org-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={resetAndClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => form.submit()}
            >
              {editing ? 'Save changes' : 'Create department'}
            </Button>
          </div>
        }
      >
        <Form<DepartmentFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void submitValues(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Engineering" />
          </Form.Item>
          <Form.Item label="Name (Chinese)" name="nameZh">
            <Input placeholder="可选中文名称" />
          </Form.Item>
          <Form.Item
            label="Code"
            tooltip="Assigned automatically on save (DEPT-0001, DEPT-0002, …)"
          >
            <Input disabled value={editing?.code ?? 'Assigned on save'} />
          </Form.Item>
          <Form.Item label="Department leader" name="leaderUserId">
            <UserSelect placeholder="Select leader (optional)" />
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
        confirmLoading={saving}
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
