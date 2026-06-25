// Gap completion — new

'use client';

import { Drawer, Form, Input, Select, Button } from 'antd';
import { useCreateChangeRequest } from '@/lib/query/change-requests';
import { useRevisionTriggers } from '@/lib/query/revision-triggers';
import { standardDetailDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
  title: string;
  description?: string;
  externalTriggerId?: string;
}

export default function CreateChangeRequestDrawer({
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
  const createMutation = useCreateChangeRequest(projectId);
  const messageApi = useAppMessage();
  const triggersQuery = useRevisionTriggers(
    projectId,
    'PENDING',
    { page: 1, limit: 50 },
    open,
  );

  const triggerOptions = (triggersQuery.data?.data ?? []).map((trigger) => ({
    value: trigger.id,
    label: `${trigger.triggerType} · ${trigger.sourceEntityId}`,
  }));

  async function handleSubmit(values: FormValues): Promise<void> {
    try {
      await createMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        sourceEntityId: values.externalTriggerId,
        sourceType: values.externalTriggerId ? 'EXTERNAL_TRIGGER' : undefined,
      });
      messageApi.success('Change request created');
      form.resetFields();
      onCreated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create change request', messageApi);
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      open={open}
      title="New change request"
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
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Brief summary of the change" />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={4} placeholder="Scope impact and rationale" />
        </Form.Item>
        <Form.Item label="External trigger" name="externalTriggerId">
          <Select
            allowClear
            placeholder="Link to pending revision trigger (optional)"
            loading={triggersQuery.isLoading}
            options={triggerOptions}
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
