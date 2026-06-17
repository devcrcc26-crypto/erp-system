'use client';

import { useState } from 'react';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Spin,
} from 'antd';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
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

  const rfi = rfiQuery.data;
  const responses = responsesQuery.data ?? [];

  async function handleStatusChange(status: RfiStatus): Promise<void> {
    if (!rfiId || !rfi) {
      return;
    }
    await updateRfi.mutateAsync({
      projectId,
      rfiId,
      body: { status },
    });
    onUpdated();
    void rfiQuery.refetch();
  }

  async function handleAddResponse(values: ResponseFormValues): Promise<void> {
    if (!rfiId) {
      return;
    }
    await addResponse.mutateAsync({
      projectId,
      rfiId,
      body: { responseText: values.responseText.trim() },
    });
    form.resetFields();
    onUpdated();
    void responsesQuery.refetch();
    void rfiQuery.refetch();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={rfi ? `${rfi.rfiNumber} — ${rfi.title}` : 'RFI detail'}
      size="large"
      destroyOnHidden
    >
      {rfiQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      )}

      {rfiQuery.isError && (
        <p className="text-sm text-slate-500">
          {rfiQuery.error instanceof ApiRequestError
            ? rfiQuery.error.message
            : 'Unable to load RFI.'}
        </p>
      )}

      {rfi && (
        <div className="space-y-6">
          <WorkflowStepper steps={RFI_WORKFLOW} currentStatus={rfi.status} />

          <Descriptions column={1} size="small" bordered>
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
              {rfi.discipline ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Raised by">
              {resolveUserName(rfi.raisedBy)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {rfi.assignedTo ? resolveUserName(rfi.assignedTo) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(rfi.dueDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Description">
              {rfi.description ?? '—'}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
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
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Responses
            </h3>
            {responses.length === 0 ? (
              <p className="text-sm text-slate-500">No responses yet</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                {responses.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {resolveUserName(item.respondedBy)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatProjectDate(item.respondedAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {item.responseText}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <Form<ResponseFormValues>
              form={form}
              layout="vertical"
              className="mt-4"
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
          </div>

          <DocumentAttachmentPanel
            readOnly
            title="Attachments"
            description="Drawing and photo attachments will be enabled when document folders are linked to this RFI."
          />
        </div>
      )}
    </Drawer>
  );
}
