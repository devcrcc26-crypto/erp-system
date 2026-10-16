// Gap completion - new

'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Space,
  Tag,
} from 'antd';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useCurrentUser } from '@/lib/query/profile';
import {
  useApproveChangeRequest,
  useChangeRequest,
  useDeleteChangeRequest,
  useRecallChangeRequest,
  useRejectChangeRequest,
  useSubmitChangeRequest,
  useUpdateChangeRequest,
} from '@/lib/query/change-requests';
import type { ChangeRequestReason } from '@/lib/api/project-management.types';
import { layout, standardDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  changeRequestStatusVariant,
  formatChangeRequestStatus,
} from '@/lib/utils/pm-status-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const CHANGE_REASON_COLORS: Record<
  ChangeRequestReason,
  { bg: string; fg: string; label: string }
> = {
  CLIENT_REQUEST: {
    bg: tokens.colorBlue50,
    fg: tokens.colorBlue800,
    label: 'Client Request',
  },
  SITE_CONDITION: {
    bg: tokens.colorAmber50,
    fg: tokens.colorAmber400,
    label: 'Site Condition',
  },
  DESIGN_ERROR: {
    bg: tokens.colorRed50,
    fg: tokens.colorRed600,
    label: 'Design Error / Omission',
  },
  REGULATORY_COMPLIANCE: {
    bg: '#F3E8FF',
    fg: '#7C3AED',
    label: 'Regulatory Compliance',
  },
};

function extractRejectionReason(description: string | null): string | null {
  if (!description) return null;
  const marker = 'Rejection reason:';
  const idx = description.lastIndexOf(marker);
  if (idx < 0) return null;
  return description.slice(idx + marker.length).trim() || null;
}

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
  const router = useRouter();
  const resolveUserName = useUserNameLookup();
  const currentUser = useCurrentUser();
  const messageApi = useAppMessage();
  const open = Boolean(changeRequestId);
  const currentUserId = currentUser.data?.id ?? '';

  const [editing, setEditing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rejectForm] = Form.useForm<{ reason: string }>();
  const [editForm] = Form.useForm<{ title: string; description?: string }>();

  const detailQuery = useChangeRequest(projectId, changeRequestId ?? '', open);
  const updateMutation = useUpdateChangeRequest(
    projectId,
    changeRequestId ?? '',
  );
  const submitMutation = useSubmitChangeRequest(
    projectId,
    changeRequestId ?? '',
  );
  const recallMutation = useRecallChangeRequest(
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
  const deleteMutation = useDeleteChangeRequest(
    projectId,
    changeRequestId ?? '',
  );

  const cr = detailQuery.data;

  const isCreator = Boolean(cr && currentUserId && cr.createdBy === currentUserId);
  const isAssignee = Boolean(
    cr && currentUserId && cr.assignedTo === currentUserId,
  );

  const affectedDocs = useMemo(() => {
    if (!cr) return [];
    if (cr.affectedEdvSnapshot?.length) {
      return cr.affectedEdvSnapshot;
    }
    return (cr.affectedEdvIds ?? []).map((id) => ({
      id,
      title: id,
      revisionLabel: '-',
    }));
  }, [cr]);

  async function handleSubmitForReview(): Promise<void> {
    if (!changeRequestId) return;
    try {
      await submitMutation.mutateAsync();
      messageApi.success('Change request submitted for review');
      onUpdated();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit change request', messageApi);
    }
  }

  async function handleRecall(): Promise<void> {
    if (!changeRequestId) return;
    try {
      await recallMutation.mutateAsync();
      messageApi.success('Change request recalled to draft');
      onUpdated();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to recall change request', messageApi);
    }
  }

  async function handleApprove(): Promise<void> {
    if (!changeRequestId) return;
    try {
      await approveMutation.mutateAsync();
      messageApi.success('Change request approved');
      setApproveConfirmOpen(false);
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

  async function handleDelete(): Promise<void> {
    if (!changeRequestId) return;
    try {
      await deleteMutation.mutateAsync();
      messageApi.success('Change request deleted');
      setDeleteConfirmOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to delete change request', messageApi);
    }
  }

  const reasonMeta =
    cr?.changeReason && cr.changeReason in CHANGE_REASON_COLORS
      ? CHANGE_REASON_COLORS[cr.changeReason as ChangeRequestReason]
      : null;

  const rejectionReason = extractRejectionReason(cr?.description ?? null);

  return (
    <>
      <Drawer
        {...standardDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={
          cr ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[14px] font-semibold">
                {cr.changeNumber}
              </span>
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
            <div className="mb-2 flex justify-end">
              <Button
                type="link"
                size="small"
                onClick={() => {
                  onClose();
                  router.push(`/projects/${projectId}/change-requests/${cr.id}`);
                }}
              >
                Open full page →
              </Button>
            </div>
            {cr.status === 'SUBMITTED' && isCreator && !isAssignee && (
              <Alert
                type="warning"
                showIcon
                message="Awaiting Discipline Lead approval"
              />
            )}
            {cr.status === 'SUBMITTED' && !isCreator && !isAssignee && (
              <Alert
                type="warning"
                showIcon
                message="Awaiting Discipline Lead approval"
              />
            )}
            {cr.status === 'APPROVED' && (
              <Alert
                type="success"
                showIcon
                message="Approved - The designer has been notified to upload revised documents."
              />
            )}
            {cr.status === 'REJECTED' && (
              <Alert
                type="error"
                showIcon
                message="Rejected"
                description={rejectionReason ?? undefined}
              />
            )}
            {cr.status === 'DRAFT' && !isCreator && (
              <Alert
                type="info"
                showIcon
                message={`Created by ${resolveUserName(cr.createdBy)}`}
              />
            )}

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
                  <Descriptions.Item label="Title">{cr.title}</Descriptions.Item>
                  {cr.linkedDesignPackage && (
                    <Descriptions.Item label="Subtask">
                      {cr.linkedDesignPackage.packageCode} -{' '}
                      {cr.linkedDesignPackage.name}
                    </Descriptions.Item>
                  )}
                  {reasonMeta && (
                    <Descriptions.Item label="Change reason">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: reasonMeta.bg,
                          color: reasonMeta.fg,
                        }}
                      >
                        {reasonMeta.label}
                      </span>
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="Description">
                    {rejectionReason
                      ? (cr.description ?? '')
                          .replace(/\n\nRejection reason:[\s\S]*$/, '')
                          .trim() || '-'
                      : (cr.description ?? '-')}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </section>

            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>
                Affected documents
              </p>
              <div className="flex flex-wrap gap-2">
                {affectedDocs.length === 0 ? (
                  <span className="text-[12px]" style={{ color: tokens.colorTextSecondary }}>
                    None
                  </span>
                ) : (
                  affectedDocs.map((edv) => (
                    <Tag key={edv.id}>
                      {edv.title} - Rev {edv.revisionLabel}
                    </Tag>
                  ))
                )}
              </div>
            </section>

            {cr.attachmentFolderId && (
              <section className={layout.drawerSection}>
                <DocumentAttachmentPanel
                  folderId={cr.attachmentFolderId}
                  readOnly={cr.status !== 'DRAFT'}
                />
              </section>
            )}

            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Timeline</p>
              <Descriptions
                className={layout.drawerDescriptionsClass}
                column={1}
                size="small"
                bordered
              >
                <Descriptions.Item label="Created">
                  {formatProjectDate(cr.createdAt)} ·{' '}
                  {resolveUserName(cr.createdBy)}
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
            </section>

            <section className={layout.drawerSection}>
              <Space wrap>
                {cr.status === 'DRAFT' && isCreator && (
                  <>
                    <Button
                      type="primary"
                      onClick={() => void handleSubmitForReview()}
                      loading={submitMutation.isPending}
                    >
                      Submit for Review
                    </Button>
                    {!editing && (
                      <Button onClick={() => setEditing(true)}>Edit</Button>
                    )}
                    {(pm.projects.canDelete || isCreator) && (
                      <Button danger onClick={() => setDeleteConfirmOpen(true)}>
                        Delete
                      </Button>
                    )}
                  </>
                )}

                {cr.status === 'SUBMITTED' && isAssignee && (
                  <>
                    <Button
                      type="primary"
                      style={{
                        backgroundColor: tokens.colorGreen600,
                        borderColor: tokens.colorGreen600,
                      }}
                      onClick={() => setApproveConfirmOpen(true)}
                      loading={approveMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button danger onClick={() => setRejectOpen(true)}>
                      Reject
                    </Button>
                  </>
                )}

                {cr.status === 'SUBMITTED' &&
                  isCreator &&
                  !isAssignee && (
                    <Button
                      onClick={() => void handleRecall()}
                      loading={recallMutation.isPending}
                    >
                      Recall to Draft
                    </Button>
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
                    rules={[
                      {
                        required: true,
                        message: 'Provide a reason for rejection',
                      },
                    ]}
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
                      Confirm Rejection
                    </Button>
                  </Space>
                </Form>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={approveConfirmOpen}
        title="Approve change request?"
        description="Approving this CR will void any active review sessions on this subtask and mark the affected documents as superseded. The designer will be notified to upload revised versions. Continue?"
        confirmLabel="Confirm"
        confirmLoading={approveMutation.isPending}
        onConfirm={() => void handleApprove()}
        onCancel={() => setApproveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete change request?"
        description="This will soft-delete the change request. This action can be audited."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
