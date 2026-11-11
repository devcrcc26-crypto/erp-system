'use client';

import { Button, Descriptions, Form, Modal, Select } from 'antd';
import type { ActionItem } from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCreateIssueFromActionItem,
  useEligibleMeetingSubtasks,
} from '@/lib/query/meetings';
import { formatProjectDate } from '@/lib/utils/project-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { layout } from '@/lib/theme/layout';

interface FormValues {
  designPackageId?: string;
}

function CreateIssueFormBody({
  projectId,
  meetingId,
  actionItem,
  onClose,
  onCreated,
}: {
  projectId: string;
  meetingId: string;
  actionItem: ActionItem;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const createIssue = useCreateIssueFromActionItem();
  const subtasksQuery = useEligibleMeetingSubtasks(projectId, true);
  const [form] = Form.useForm<FormValues>();

  async function handleCreate(): Promise<void> {
    const values = await form.validateFields();
    try {
      await createIssue.mutateAsync({
        projectId,
        meetingId,
        actionItemId: actionItem.id,
        designPackageId: values.designPackageId,
      });
      messageApi.success('Issue created and linked');
      onCreated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create issue', messageApi);
    }
  }

  return (
    <>
      <Descriptions
        className={`${layout.drawerDescriptionsClass} !mb-4`}
        column={1}
        size="small"
        bordered
      >
        <Descriptions.Item label="Issue type">Meeting Action</Descriptions.Item>
        {actionItem.title?.trim() ? (
          <Descriptions.Item label="Title">{actionItem.title}</Descriptions.Item>
        ) : null}
        <Descriptions.Item label="Description">
          {actionItem.description}
        </Descriptions.Item>
        <Descriptions.Item label="Assigned to">
          {actionItem.ownerId
            ? resolveUserDisplay(actionItem.ownerId, actionItem.ownerName)
            : (actionItem.assignedToName ?? '-')}
        </Descriptions.Item>
        <Descriptions.Item label="Due date">
          {actionItem.dueDate ? formatProjectDate(actionItem.dueDate) : '-'}
        </Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical" className="erp-drawer-form">
        <Form.Item name="designPackageId" label="Subtask (optional)">
          <Select
            allowClear
            placeholder="Link this issue to a subtask"
            loading={subtasksQuery.isLoading}
            options={(subtasksQuery.data ?? []).map((s) => ({
              value: s.id,
              label: `${s.fullCode} - ${s.name}`,
            }))}
          />
        </Form.Item>
      </Form>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          loading={createIssue.isPending}
          onClick={() => void handleCreate()}
        >
          Create Issue
        </Button>
      </div>
    </>
  );
}

export default function CreateIssueFromActionItemModal({
  projectId,
  meetingId,
  actionItem,
  onClose,
  onCreated,
}: {
  projectId: string;
  meetingId: string;
  actionItem: ActionItem | null;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const open = Boolean(actionItem);

  return (
    <Modal
      title="Create Issue from Action Item"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={null}
    >
      {actionItem ? (
        <CreateIssueFormBody
          projectId={projectId}
          meetingId={meetingId}
          actionItem={actionItem}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : null}
    </Modal>
  );
}
