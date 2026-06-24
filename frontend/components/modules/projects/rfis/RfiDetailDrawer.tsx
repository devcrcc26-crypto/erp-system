// UI polish pass - styles only, no logic changes

'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
} from 'antd';
import { MessageSquare } from 'lucide-react';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import TableEmptyState from '@/components/ui/TableEmptyState';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { RfiStatus } from '@/lib/api/project-management.types';
import { RFI_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useAddRfiResponse,
  useRfi,
  useRfiResponses,
  useUpdateRfi,
} from '@/lib/query/rfis';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRfiStatus,
  rfiPriorityVariant,
  rfiStatusVariant,
} from '@/lib/utils/pm-status-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ResponseFormValues {
  responseText: string;
}

export default function RfiDetailDrawer({
  projectId,
  rfiId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  rfiId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<ResponseFormValues>();
  const resolveUserName = useUserNameLookup();
  const open = Boolean(rfiId);

  const rfiQuery = useRfi(projectId, rfiId ?? '', open);
  const responsesQuery = useRfiResponses(projectId, rfiId ?? '', open);
  const updateRfi = useUpdateRfi();
  const addResponse = useAddRfiResponse();
  const messageApi = useAppMessage();

  const rfi = rfiQuery.data;
  const responses = responsesQuery.data ?? [];

  async function handleStatusChange(status: RfiStatus): Promise<void> {
    if (!rfiId || !rfi) {
      return;
    }
    try {
      await updateRfi.mutateAsync({
        projectId,
        rfiId,
        body: { status },
      });
      messageApi.success('RFI status updated');
      onUpdated();
      void rfiQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update RFI status', messageApi);
    }
  }

  async function handleAddResponse(values: ResponseFormValues): Promise<void> {
    if (!rfiId) {
      return;
    }
    try {
      await addResponse.mutateAsync({
        projectId,
        rfiId,
        body: { responseText: values.responseText.trim() },
      });
      messageApi.success('Response posted successfully');
      form.resetFields();
      onUpdated();
      void responsesQuery.refetch();
      void rfiQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to post RFI response', messageApi);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={rfi ? `${rfi.rfiNumber} - ${rfi.title}` : 'RFI detail'}
      destroyOnHidden
    >
      {rfiQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-32 w-full rounded" />
        </div>
      )}

      {rfiQuery.isError && (
        <p className={layout.drawerMutedText}>
          {rfiQuery.error instanceof ApiRequestError
            ? rfiQuery.error.message
            : 'Unable to load RFI.'}
        </p>
      )}

      {rfi && (
        <div className={layout.drawerStack}>
          <WorkflowStepper
            className="erp-drawer-workflow"
            steps={RFI_WORKFLOW}
            currentStatus={rfi.status}
          />

          <Descriptions
            className={layout.drawerDescriptionsClass}
            column={1}
            size="small"
            bordered
          >
            <Descriptions.Item label="Status">
              <StatusBadge
                label={formatRfiStatus(rfi.status)}
                variant={rfiStatusVariant(rfi.status)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Priority">
              <StatusBadge
                label={rfi.priority}
                variant={rfiPriorityVariant(rfi.priority)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Discipline">
              {rfi.discipline ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Raised by">
              {resolveUserName(rfi.raisedBy)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {rfi.assignedTo ? resolveUserName(rfi.assignedTo) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(rfi.dueDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Description">
              {rfi.description ?? '-'}
            </Descriptions.Item>
          </Descriptions>

          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>
              Update status
            </p>
            <Select
              className="w-full max-w-xs"
              value={rfi.status}
              onChange={(value: RfiStatus) => void handleStatusChange(value)}
              loading={updateRfi.isPending}
              options={RFI_WORKFLOW.map((step) => ({
                value: step.key,
                label: step.label,
              }))}
            />
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>
              Responses
            </h3>
            {responses.length === 0 ? (
              <TableEmptyState
                icon={<MessageSquare />}
                title="No responses yet"
                description="Official responses will appear here once posted"
              />
            ) : (
              <ul className="erp-drawer-list">
                {responses.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className={layout.drawerHeading}>
                        {resolveUserName(item.respondedBy)}
                      </span>
                      <span className={layout.drawerMetaLabel}>
                        {formatProjectDate(item.respondedAt)}
                      </span>
                    </div>
                    <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                      {item.responseText}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <Form<ResponseFormValues>
              form={form}
              layout="vertical"
              className="erp-drawer-form mt-4"
              onFinish={(values: ResponseFormValues) =>
                void handleAddResponse(values)
              }
            >
              <Form.Item
                label="Add response"
                name="responseText"
                rules={[{ required: true, message: 'Enter a response' }]}
              >
                <Input.TextArea rows={3} placeholder="Official response text" />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={addResponse.isPending}
              >
                Post response
              </Button>
            </Form>
          </section>

          <DocumentAttachmentPanel
            folderId={rfi.attachmentFolderId ?? undefined}
            title="Attachments"
            description="Upload drawings, photos, or markup files related to this RFI."
          />

          <Alert
            type="info"
            showIcon
            className="mt-4"
            title="EPC revision"
            description="If this RFI requires a new engineering document revision, open the linked document from Disciplines and use Trigger Revision on the engineering document detail page."
          />
        </div>
      )}
    </Drawer>
  );
}
