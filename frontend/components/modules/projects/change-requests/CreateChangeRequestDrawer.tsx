// Gap completion — new

'use client';

import { Drawer, Form, Input, Select, Button } from 'antd';
import { useCreateChangeRequest } from '@/lib/query/change-requests';
import { useRevisionTriggers } from '@/lib/query/revision-triggers';
import { useMeetings } from '@/lib/query/meetings';
import { useCorrespondence } from '@/lib/query/correspondence';
import { standardDetailDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const SOURCE_TYPE_OPTIONS = [
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'DAILY_LOG', label: 'Daily Log' },
  { value: 'SUBMITTAL_REVIEW', label: 'Submittal Review' },
];

interface FormValues {
  title: string;
  description?: string;
  externalTriggerId?: string;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  originEntityId?: string;
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
  const sourceEntityType = Form.useWatch('sourceEntityType', form);
  const meetingsQuery = useMeetings(projectId, { page: 1, limit: 50 }, open && sourceEntityType === 'MEETING');
  const correspondenceQuery = useCorrespondence(projectId, { page: 1, limit: 50 }, open && sourceEntityType === 'CORRESPONDENCE');

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
        sourceEntityType: values.sourceEntityType || undefined,
        originEntityId: values.originEntityId || undefined,
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
        <Form.Item label="Source type" name="sourceEntityType">
          <Select
            allowClear
            placeholder="Select source of this change request (optional)"
            options={SOURCE_TYPE_OPTIONS}
            onChange={() => form.setFieldValue('originEntityId', undefined)}
          />
        </Form.Item>
        {sourceEntityType && (
          <Form.Item label="Source entity" name="originEntityId">
            {sourceEntityType === 'MEETING' ? (
              <Select
                allowClear
                placeholder="Select meeting"
                loading={meetingsQuery.isLoading}
                options={(meetingsQuery.data?.data ?? []).map((m) => ({
                  value: m.id,
                  label: m.title,
                }))}
              />
            ) : sourceEntityType === 'CORRESPONDENCE' ? (
              <Select
                allowClear
                placeholder="Select correspondence"
                loading={correspondenceQuery.isLoading}
                options={(correspondenceQuery.data?.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.subject,
                }))}
              />
            ) : (
              <Input placeholder="Paste entity ID" />
            )}
          </Form.Item>
        )}
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
