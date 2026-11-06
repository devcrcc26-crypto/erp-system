'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Skeleton,
  Space,
  Table,
  Tabs,
  Timeline,
} from 'antd';
import { ArrowLeft } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AffectedEdvSnapshotItem,
  ChangeRequestReason,
} from '@/lib/api/project-management.types';
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
import { layout } from '@/lib/theme/layout';
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

export default function ChangeRequestDetailPageContent({
  projectId,
  crId,
}: {
  projectId: string;
  crId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const resolveUserName = useUserNameLookup();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';

  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rejectForm] = Form.useForm<{ reason: string }>();
  const [editForm] = Form.useForm<{ title: string; description?: string }>();

  const detailQuery = useChangeRequest(projectId, crId);
  const updateMutation = useUpdateChangeRequest(projectId, crId);
  const submitMutation = useSubmitChangeRequest(projectId, crId);
  const recallMutation = useRecallChangeRequest(projectId, crId);
  const approveMutation = useApproveChangeRequest(projectId, crId);
  const rejectMutation = useRejectChangeRequest(projectId, crId);
  const deleteMutation = useDeleteChangeRequest(projectId, crId);

  const cr = detailQuery.data;

  const isCreator = Boolean(cr && currentUserId && cr.createdBy === currentUserId);
  const isAssignee = Boolean(
    cr && currentUserId && cr.assignedTo === currentUserId,
  );

  const affectedDocs = useMemo((): AffectedEdvSnapshotItem[] => {
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

  const affectedDocsColumns: ColumnsType<AffectedEdvSnapshotItem> = useMemo(
    () => [
      {
        title: 'Document Number / Title',
        dataIndex: 'title',
        key: 'title',
      },
      {
        title: 'Version',
        dataIndex: 'revisionLabel',
        key: 'version',
        width: 140,
        render: (value: string) => `Rev ${value}`,
      },
      {
        title: 'Status',
        dataIndex: 'revisionLabel',
        key: 'status',
        width: 140,
        render: (value: string) => <StatusBadge label={value} variant="info" />,
      },
    ],
    [],
  );

  async function handleSubmitForReview(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success('Change request submitted for review');
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit change request', messageApi);
    }
  }

  async function handleRecall(): Promise<void> {
    try {
      await recallMutation.mutateAsync();
      messageApi.success('Change request recalled to draft');
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to recall change request', messageApi);
    }
  }

  async function handleApprove(): Promise<void> {
    try {
      await approveMutation.mutateAsync();
      messageApi.success('Change request approved');
      setApproveConfirmOpen(false);
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to approve change request', messageApi);
    }
  }

  async function handleReject(values: { reason: string }): Promise<void> {
    try {
      await rejectMutation.mutateAsync({ reason: values.reason.trim() });
      messageApi.success('Change request rejected');
      setRejectOpen(false);
      rejectForm.resetFields();
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to reject change request', messageApi);
    }
  }

  async function handleSaveEdit(values: {
    title: string;
    description?: string;
  }): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });
      messageApi.success('Change request updated');
      setEditing(false);
      void detailQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update change request', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync();
      messageApi.success('Change request deleted');
      setDeleteConfirmOpen(false);
      router.push(`/projects/${projectId}/change-requests`);
    } catch (error) {
      notifyApiError(error, 'Failed to delete change request', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !cr) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load change request"
        description={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  const reasonMeta =
    cr.changeReason && cr.changeReason in CHANGE_REASON_COLORS
      ? CHANGE_REASON_COLORS[cr.changeReason as ChangeRequestReason]
      : null;

  const rejectionReason = extractRejectionReason(cr.description ?? null);
  const displayDescription = rejectionReason
    ? (cr.description ?? '')
        .replace(/\n\nRejection reason:[\s\S]*$/, '')
        .trim() || '-'
    : (cr.description ?? '-');

  return (
    <div className={layout.pageStack}>
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/change-requests`)}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to change requests
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <span className="font-mono text-[14px] font-semibold text-[var(--color-text-primary)]">
            {cr.changeNumber}
          </span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {cr.title}
          </h1>
          <StatusBadge
            label={formatChangeRequestStatus(cr.status)}
            variant={changeRequestStatusVariant(cr.status)}
          />
        </div>
      </div>

      {/* Main content with tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        destroyOnHidden
        items={[
          {
            key: 'overview',
            label: 'Overview',
            children: editing ? (
              <div className={layout.cardSurface + ' ' + layout.cardPadding}>
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
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <Descriptions
                    className={layout.drawerDescriptionsClass}
                    column={{ xs: 1, sm: 2 }}
                    size="small"
                    bordered
                  >
                    <Descriptions.Item label="CR Number">
                      {cr.changeNumber}
                    </Descriptions.Item>
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
                    <Descriptions.Item label="Status">
                      <StatusBadge
                        label={formatChangeRequestStatus(cr.status)}
                        variant={changeRequestStatusVariant(cr.status)}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Raised by">
                      {resolveUserName(cr.createdBy)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Assigned to">
                      {cr.assignedTo ? resolveUserName(cr.assignedTo) : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Created date">
                      {formatProjectDate(cr.createdAt)}
                    </Descriptions.Item>
                    {cr.approvedAt && (
                      <Descriptions.Item
                        label={cr.status === 'REJECTED' ? 'Rejected date' : 'Approved date'}
                      >
                        {formatProjectDate(cr.approvedAt)}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </div>

                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <p className={`mb-2 ${layout.drawerHeading}`}>Description</p>
                  <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                    {displayDescription}
                  </p>
                </div>

                {cr.status === 'REJECTED' && rejectionReason && (
                  <Alert
                    type="error"
                    showIcon
                    title="Rejected"
                    description={rejectionReason}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'affected-docs',
            label: 'Affected documents',
            children: (
              <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                <Table<AffectedEdvSnapshotItem>
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={affectedDocs}
                  scroll={{ x: 'max-content' }}
                  columns={affectedDocsColumns}
                  locale={{ emptyText: 'No affected documents' }}
                />
              </div>
            ),
          },
          {
            key: 'discussion',
            label: 'Discussion',
            children: (
              <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                <Timeline
                  items={[
                    {
                      content: (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            Created - {resolveUserName(cr.createdBy)}
                          </span>
                          <span className={layout.drawerMutedText}>
                            {formatProjectDate(cr.createdAt)}
                          </span>
                        </div>
                      ),
                    },
                    ...(cr.approvedBy
                      ? [
                          {
                            content: (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                  {cr.status === 'REJECTED' ? 'Rejected' : 'Approved'} -{' '}
                                  {resolveUserName(cr.approvedBy)}
                                </span>
                                {cr.approvedAt && (
                                  <span className={layout.drawerMutedText}>
                                    {formatProjectDate(cr.approvedAt)}
                                  </span>
                                )}
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'files',
            label: 'Files',
            children: (
              <DocumentAttachmentPanel
                folderId={cr.attachmentFolderId ?? undefined}
                readOnly={cr.status !== 'DRAFT'}
                title="Change request files"
                description="Supporting documents for this change request."
              />
            ),
          },
        ]}
      />

      {/* Sticky bottom workflow bar */}
      <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
        {cr.status === 'DRAFT' && isCreator && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              Ready to submit this change request for review?
            </span>
            <Space wrap>
              <Button
                type="primary"
                loading={submitMutation.isPending}
                onClick={() => void handleSubmitForReview()}
              >
                Submit for Review
              </Button>
              <Button onClick={() => setEditing((v) => !v)}>
                {editing ? 'Cancel edit' : 'Edit'}
              </Button>
              {(pm.projects.canDelete || isCreator) && (
                <Button danger onClick={() => setDeleteConfirmOpen(true)}>
                  Delete
                </Button>
              )}
            </Space>
          </div>
        )}

        {cr.status === 'SUBMITTED' && isAssignee && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              This change request is awaiting your review.
            </span>
            <Space wrap>
              <Button
                type="primary"
                style={{
                  backgroundColor: tokens.colorGreen600,
                  borderColor: tokens.colorGreen600,
                }}
                loading={approveMutation.isPending}
                onClick={() => setApproveConfirmOpen(true)}
              >
                Approve
              </Button>
              <Button danger onClick={() => setRejectOpen((v) => !v)}>
                Reject
              </Button>
            </Space>
          </div>
        )}

        {cr.status === 'SUBMITTED' && isCreator && !isAssignee && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              Awaiting Discipline Lead approval.
            </span>
            <Button
              loading={recallMutation.isPending}
              onClick={() => void handleRecall()}
            >
              Recall to Draft
            </Button>
          </div>
        )}

        {cr.status === 'APPROVED' && (
          <Alert
            type="success"
            showIcon
            title="Approved - The designer has been notified to upload revised documents."
          />
        )}

        {cr.status === 'REJECTED' && !rejectionReason && (
          <Alert type="error" showIcon title="Rejected" />
        )}

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
      </div>

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
    </div>
  );
}
