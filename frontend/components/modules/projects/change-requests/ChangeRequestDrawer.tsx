// Gap completion — new

'use client';

import { useState } from 'react';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Space,
} from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useApproveChangeRequest,
  useChangeRequest,
  useRejectChangeRequest,
  useUpdateChangeRequest,
} from '@/lib/query/change-requests';
import { layout, standardDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  changeRequestStatusVariant,
  formatChangeRequestStatus,
} from '@/lib/utils/pm-status-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function ChangeRequestDrawer({
  projectId,
  changeRequestId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  changeRequestId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const pm = usePmCapabilities();
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();
  const open = Boolean(changeRequestId);
  const [editing, setEditing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectForm] = Form.useForm<{ reason: string }>();
  const [editForm] = Form.useForm<{ title: string; description?: string }>();

  const detailQuery = useChangeRequest(projectId, changeRequestId ?? '', open);
  const updateMutation = useUpdateChangeRequest(
    projectId,
    changeRequestId ?? '',
  );
  const approveMutation = useApproveChangeRequest(
    projectId,
    changeRequestId ?? '',
  );
  const rejectMutation = useRejectChangeRequest(
    projectId,
    changeRequestId ?? '',
  );

  const cr = detailQuery.data;

  async function handleSubmitForReview(): Promise<void> {
    if (!changeRequestId) return;
    try {
      await updateMutation.mutateAsync({ status: 'SUBMITTED' });
      messageApi.success('Change request submitted for review');
      onUpdated();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit change request', messageApi);
    }
  }

  async function handleApprove(): Promise<void> {
    if (!changeRequestId) return;
    try {
      await approveMutation.mutateAsync();
      messageApi.success('Change request approved');
      onUpdated();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to approve change request', messageApi);
    }
  }

  async function handleReject(values: { reason: string }): Promise<void> {
    if (!changeRequestId) return;
    try {
      await rejectMutation.mutateAsync({ reason: values.reason.trim() });
      messageApi.success('Change request rejected');
      setRejectOpen(false);
      rejectForm.resetFields();
      onUpdated();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to reject change request', messageApi);
    }
  }

  async function handleSaveEdit(values: {
    title: string;
    description?: string;
  }): Promise<void> {
    if (!changeRequestId) return;
    try {
      await updateMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });
      messageApi.success('Change request updated');
      setEditing(false);
      onUpdated();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update change request', messageApi);
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={
        cr ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px]">{cr.changeNumber}</span>
            <span>{cr.title}</span>
            <StatusBadge
              label={formatChangeRequestStatus(cr.status)}
              variant={changeRequestStatusVariant(cr.status)}
            />
          </div>
        ) : (
          'Change request'
        )
      }
      destroyOnHidden
    >
      {detailQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-24 w-full rounded" />
        </div>
      )}

      {cr && (
        <div className={layout.drawerStack}>
          <section>
            <p className={`mb-2 ${layout.drawerHeading}`}>Details</p>
            {editing ? (
              <Form
                form={editForm}
                layout="vertical"
                className="erp-drawer-form"
                initialValues={{
                  title: cr.title,
                  description: cr.description ?? undefined,
                }}
                onFinish={(values) => void handleSaveEdit(values)}
              >
                <Form.Item
                  label="Title"
                  name="title"
                  rules={[{ required: true, message: 'Title is required' }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item label="Description" name="description">
                  <Input.TextArea rows={4} />
                </Form.Item>
                <Space>
                  <Button onClick={() => setEditing(false)}>Cancel</Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={updateMutation.isPending}
                  >
                    Save
                  </Button>
                </Space>
              </Form>
            ) : (
              <Descriptions
                className={layout.drawerDescriptionsClass}
                column={1}
                size="small"
                bordered
              >
                <Descriptions.Item label="Description">
                  {cr.description ?? '-'}
                </Descriptions.Item>
                {cr.sourceEntityId && (
                  <Descriptions.Item label="Source reference">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: tokens.colorAmber50,
                        color: tokens.colorAmber400,
                      }}
                    >
                      {cr.sourceType} · {cr.sourceEntityId}
                    </span>
                  </Descriptions.Item>
                )}
              </Descriptions>
            )}
          </section>

          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>Timeline</p>
            <Descriptions
              className={layout.drawerDescriptionsClass}
              column={1}
              size="small"
              bordered
            >
              <Descriptions.Item label="Created">
                {formatProjectDate(cr.createdAt)}
              </Descriptions.Item>
              {cr.approvedBy && (
                <Descriptions.Item label="Approved by">
                  {resolveUserName(cr.approvedBy)}
                  {cr.approvedAt
                    ? ` · ${formatProjectDate(cr.approvedAt)}`
                    : ''}
                </Descriptions.Item>
              )}
            </Descriptions>
            {cr.status === 'REJECTED' && cr.description?.includes('[Rejected]') && (
              <div
                className="mt-3 rounded-lg p-3 text-[12px]"
                style={{
                  backgroundColor: tokens.colorRed50,
                  color: tokens.colorRed600,
                }}
              >
                {cr.description}
              </div>
            )}
          </section>

          <section className={layout.drawerSection}>
            <Space wrap>
              {cr.status === 'DRAFT' && (
                <Button
                  type="primary"
                  onClick={() => void handleSubmitForReview()}
                  loading={updateMutation.isPending}
                >
                  Submit for review
                </Button>
              )}
              {cr.status === 'SUBMITTED' && pm.projects.canEdit && (
                <>
                  <Button
                    type="primary"
                    style={{
                      backgroundColor: tokens.colorGreen600,
                      borderColor: tokens.colorGreen600,
                    }}
                    onClick={() => void handleApprove()}
                    loading={approveMutation.isPending}
                  >
                    Approve
                  </Button>
                  <Button danger onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </>
              )}
              {(cr.status === 'DRAFT' || cr.status === 'SUBMITTED') &&
                pm.projects.canEdit &&
                !editing && (
                  <Button onClick={() => setEditing(true)}>Edit</Button>
                )}
            </Space>

            {rejectOpen && (
              <Form
                form={rejectForm}
                layout="vertical"
                className="erp-drawer-form mt-4"
                onFinish={(values) => void handleReject(values)}
              >
                <Form.Item
                  label="Rejection reason"
                  name="reason"
                  rules={[{ required: true, message: 'Reason is required' }]}
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Space>
                  <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
                  <Button
                    danger
                    htmlType="submit"
                    loading={rejectMutation.isPending}
                  >
                    Confirm reject
                  </Button>
                </Space>
              </Form>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
