'use client';

import './org-v2.css';

import { useEffect } from 'react';
import { Button, Drawer, Form, Input, Switch } from 'antd';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import {
  useCreateEngineeringDiscipline,
  useUpdateEngineeringDiscipline,
  type EngineeringDiscipline,
} from '@/lib/query/org';
import { useAppMessage } from '@/hooks/use-app-message';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DisciplineFormValues {
  name: string;
  nameZh?: string;
  leaderId?: string;
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
  const saving = createDiscipline.isPending || updateDiscipline.isPending;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        nameZh: editing.nameZh ?? undefined,
        leaderId: editing.leaderId ?? undefined,
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
            leaderId: values.leaderId ?? null,
            isActive: values.isActive,
          },
        });
        messageApi.success('Discipline updated');
      } else {
        await createDiscipline.mutateAsync({
          name: values.name.trim(),
          nameZh: values.nameZh?.trim() || undefined,
          leaderId: values.leaderId,
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

  const title = readOnly
    ? 'View discipline'
    : editing
      ? 'Edit discipline'
      : 'Add discipline';

  return (
    <Drawer
      open={open}
      size={480}
      className="erp-responsive-drawer erp-org-drawer"
      rootClassName="erp-org-drawer"
      styles={detailDrawerStyles}
      onClose={onClose}
      destroyOnHidden
      title={
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">{title}</div>
          <p className="erp-org-drawer-hint">
            {readOnly
              ? 'Discipline details (read only).'
              : 'Leaders are the first approver for leave from employees in this discipline.'}
          </p>
        </div>
      }
      footer={
        readOnly ? (
          <div className="erp-org-drawer-footer flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="erp-org-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => form.submit()}
            >
              {editing ? 'Save changes' : 'Create discipline'}
            </Button>
          </div>
        )
      }
    >
      <Form<DisciplineFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={readOnly}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input placeholder="e.g. Structural" />
        </Form.Item>
        <Form.Item label="Name (Chinese)" name="nameZh">
          <Input placeholder="可选中文名称" />
        </Form.Item>
        <Form.Item
          label="Discipline leader"
          name="leaderId"
          tooltip="First approver for leave requests from employees in this discipline"
        >
          <UserSelect
            placeholder="Select leader (optional)"
            disabled={readOnly}
          />
        </Form.Item>
        <Form.Item label="Active" name="isActive" valuePropName="checked">
          <Switch disabled={readOnly} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
