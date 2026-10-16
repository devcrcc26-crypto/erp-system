'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Upload,
} from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';
import CreateChangeRequestDrawer from '@/components/modules/projects/change-requests/CreateChangeRequestDrawer';
import { apiGet } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import type { ProjectChangeRequest } from '@/lib/api/project-management.types';
import { useAppMessage } from '@/hooks/use-app-message';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import {
  useAddIssueResponse,
  useCloseIssue,
  useIssue,
  useIssueResponses,
  useLinkIssueCr,
  useReopenIssue,
} from '@/lib/query/issues';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { layout, standardDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  changeRequestStatusVariant,
  formatChangeRequestStatus,
  formatIssueStatus,
  isOverdue,
  issueSeverityVariant,
  issueStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';

dayjs.extend(relativeTime);

interface ResponseFormValues {
  responseText: string;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

async function downloadResponseDocument(documentId: string): Promise<void> {
  const { url } = await apiGet<{ url: string; expiresIn: number }>(
    `/documents/${documentId}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function IssueDetailDrawer({
  projectId,
  issueId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  issueId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const router = useRouter();
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const open = Boolean(issueId);

  const issueQuery = useIssue(projectId, issueId ?? '', open);
  const responsesQuery = useIssueResponses(projectId, issueId ?? '', open);
  const closeIssue = useCloseIssue();
  const reopenIssue = useReopenIssue();
  const addResponse = useAddIssueResponse();
  const uploadDocument = useUploadDocumentToFolder();
  const linkIssueCr = useLinkIssueCr();

  const [form] = Form.useForm<ResponseFormValues>();
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [responseDocId, setResponseDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [createCrOpen, setCreateCrOpen] = useState(false);
  const [selectedCr, setSelectedCr] = useState<{
    projectId: string;
    changeRequestId: string;
  } | null>(null);

  const issue = issueQuery.data;
  const responses = responsesQuery.data ?? [];

  const linkedCrs = useMemo(() => {
    if (!issue) {
      return [];
    }
    return issue.linkedCrs ?? [];
  }, [issue]);

  const canClose =
    issue?.status === 'IN_PROGRESS' && currentUserId === issue?.raisedBy;
  const canReopen =
    issue?.status === 'CLOSED' &&
    (currentUserId === issue?.raisedBy ||
      currentUserId === issue?.assignedTo ||
      pm.projects.canView);
  const canRespond =
    issue != null &&
    issue.status !== 'CLOSED' &&
    (currentUserId === issue.raisedBy ||
      currentUserId === issue.assignedTo ||
      pm.projects.canView);
  const canRaiseCr =
    issue != null &&
    issue.status !== 'CLOSED' &&
    Boolean(issue.linkedDesignPackageId);
  const showWaitingAlert =
    responses.length === 0 && issue?.status === 'OPEN';

  function resetResponseAttachment(): void {
    setResponseFile(null);
    setResponseDocId(null);
    setUploadedFileName(null);
    setUploading(false);
  }

  function closeResponseModal(): void {
    setResponseModalOpen(false);
    form.resetFields();
    resetResponseAttachment();
  }

  useEffect(() => {
    if (!open) {
      form.resetFields();
      resetResponseAttachment();
      setResponseModalOpen(false);
      setCloseOpen(false);
      setResolutionNote('');
      setReopenOpen(false);
      setReopenReason('');
      setCreateCrOpen(false);
      setSelectedCr(null);
    }
  }, [open, form]);

  async function refresh(): Promise<void> {
    onUpdated();
    await Promise.all([issueQuery.refetch(), responsesQuery.refetch()]);
  }

  async function handleClose(): Promise<void> {
    if (!issueId) {
      return;
    }
    const note = resolutionNote.trim();
    if (!note) {
      messageApi.error('Enter a resolution note');
      return;
    }
    try {
      await closeIssue.mutateAsync({
        projectId,
        issueId,
        body: { resolutionNote: note },
      });
      messageApi.success('Issue closed');
      setCloseOpen(false);
      setResolutionNote('');
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to close issue', messageApi);
    }
  }

  async function handleReopen(): Promise<void> {
    if (!issueId) {
      return;
    }
    const reason = reopenReason.trim();
    if (!reason) {
      messageApi.error('Enter a reopen reason');
      return;
    }
    try {
      await reopenIssue.mutateAsync({
        projectId,
        issueId,
        body: { reason },
      });
      messageApi.success('Issue reopened');
      setReopenOpen(false);
      setReopenReason('');
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to reopen issue', messageApi);
    }
  }

  async function uploadResponseFile(file: File): Promise<string | null> {
    if (!issue?.attachmentFolderId) {
      messageApi.error(
        'Issue has no attachment folder. Save the issue before attaching files.',
      );
      return null;
    }
    setUploading(true);
    try {
      const uploaded = await uploadDocument.mutateAsync({
        folderId: issue.attachmentFolderId,
        file,
      });
      setResponseDocId(uploaded.id);
      setUploadedFileName(uploaded.name);
      return uploaded.id;
    } catch (uploadError) {
      notifyApiError(
        uploadError,
        'Failed to upload response attachment',
        messageApi,
      );
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleAddResponse(values: ResponseFormValues): Promise<void> {
    if (!issueId) {
      return;
    }
    try {
      await addResponse.mutateAsync({
        projectId,
        issueId,
        body: {
          responseText: values.responseText.trim(),
          responseDocumentId: responseDocId ?? undefined,
        },
      });
      messageApi.success('Response posted');
      closeResponseModal();
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to post response', messageApi);
    }
  }

  async function handleCrCreated(created?: ProjectChangeRequest): Promise<void> {
    setCreateCrOpen(false);
    if (created && issueId) {
      try {
        await linkIssueCr.mutateAsync({
          projectId,
          issueId,
          crId: created.id,
        });
        void issueQuery.refetch();
        onUpdated();
      } catch (error) {
        notifyApiError(error, 'Change request created but linking failed', messageApi);
      }
    } else {
      void issueQuery.refetch();
      onUpdated();
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={
        issue ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-semibold">
              {issue.issueNumber}
            </span>
            <StatusBadge
              label={formatIssueStatus(issue.status)}
              variant={issueStatusVariant(issue.status)}
            />
          </div>
        ) : (
          'Issue'
        )
      }
      destroyOnHidden
    >
      {issueQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-32 w-full rounded" />
        </div>
      )}

      {issueQuery.isError && (
        <p className={layout.drawerMutedText}>
          {issueQuery.error instanceof ApiRequestError
            ? issueQuery.error.message
            : 'Unable to load issue.'}
        </p>
      )}

      {issue && (
        <div className={layout.drawerStack}>
          <div className="mb-2 flex justify-end">
            <Button
              type="link"
              size="small"
              onClick={() => {
                onClose();
                router.push(`/projects/${projectId}/issues/${issue.id}`);
              }}
            >
              Open full page →
            </Button>
          </div>
          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>Details</p>
            <Descriptions
              className={layout.drawerDescriptionsClass}
              column={1}
              size="small"
              bordered
            >
              <Descriptions.Item label="Issue Type">
                {issue.issueType ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Raised By">
                {issue.raisedByName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Assigned To">
                {issue.assignedToName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Date Raised">
                {formatProjectDate(issue.createdAt)}
              </Descriptions.Item>
              {issue.dueDate && (
                <Descriptions.Item label="Due Date">
                  <span
                    className={
                      isOverdue(issue.dueDate) && issue.status !== 'CLOSED'
                        ? 'font-medium text-red-600'
                        : ''
                    }
                  >
                    {formatProjectDate(issue.dueDate)}
                  </span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Severity">
                <StatusBadge
                  label={issue.severity}
                  variant={issueSeverityVariant(issue.severity)}
                />
              </Descriptions.Item>
              {issue.location && (
                <Descriptions.Item label="Location">
                  {issue.location}
                </Descriptions.Item>
              )}
              {issue.linkedDesignPackage && (
                <Descriptions.Item label="Subtask">
                  {issue.linkedDesignPackage.fullCode} -{' '}
                  {issue.linkedDesignPackage.name}
                </Descriptions.Item>
              )}
              {issue.sourceEntityType && (
                <Descriptions.Item label="Source Type">
                  {issue.sourceEntityType.replace(/_/g, ' ')}
                </Descriptions.Item>
              )}
              {issue.status === 'CLOSED' && issue.resolvedAt && (
                <Descriptions.Item label="Closed On">
                  {formatProjectDate(issue.resolvedAt)}
                </Descriptions.Item>
              )}
              {issue.status === 'CLOSED' && issue.resolvedByName && (
                <Descriptions.Item label="Closed By">
                  {issue.resolvedByName}
                </Descriptions.Item>
              )}
            </Descriptions>
          </section>

          <section className={layout.drawerSection}>
            <p className={`mb-1 ${layout.drawerHeading}`}>Description</p>
            <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
              {issue.description}
            </p>
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Discussion</h3>

            {showWaitingAlert && (
              <Alert
                type="info"
                showIcon
                className="mb-3"
                description="No responses yet. Waiting for the assignee to respond."
              />
            )}

            {responses.length > 0 && (
              <ul className="flex flex-col gap-3">
                {responses.map((item) => {
                  const displayName = resolveUserDisplay(
                    item.respondedBy,
                    item.respondedByName,
                  );
                  return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-surface-secondary)] p-3"
                    >
                      <div className="mb-2 flex items-start gap-2">
                        <Avatar size={28} style={{ backgroundColor: tokens.colorTeal400 }}>
                          {initialsFromName(displayName)}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className={layout.drawerHeading}>{displayName}</span>
                            <span className={layout.drawerMetaLabel}>
                              {dayjs(item.respondedAt).fromNow()} ·{' '}
                              {formatProjectDate(item.respondedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                        {item.responseText}
                      </p>
                      {item.responseDocumentId && (
                        <div className="mt-2">
                          <Button
                            type="link"
                            size="small"
                            className="!px-0"
                            icon={<DownloadOutlined />}
                            onClick={() =>
                              void downloadResponseDocument(
                                item.responseDocumentId as string,
                              )
                            }
                          >
                            {item.responseDocumentName ?? 'Attachment'}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canRespond && (
              <Button
                type="primary"
                className="mt-3"
                onClick={() => setResponseModalOpen(true)}
              >
                Add Response
              </Button>
            )}
          </section>

          <section className={layout.drawerSection}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className={layout.drawerHeading}>Linked Change Requests</h3>
              {canRaiseCr && (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  loading={linkIssueCr.isPending}
                  onClick={() => setCreateCrOpen(true)}
                >
                  Raise Change Request
                </Button>
              )}
            </div>

            {linkedCrs.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-tertiary)]">
                    <th
                      className={`${layout.drawerMetaLabel} pb-1 text-left font-medium`}
                    >
                      CR Number
                    </th>
                    <th
                      className={`${layout.drawerMetaLabel} pb-1 text-left font-medium`}
                    >
                      Title
                    </th>
                    <th
                      className={`${layout.drawerMetaLabel} pb-1 text-left font-medium`}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linkedCrs.map((cr) => (
                    <tr
                      key={cr.id}
                      className="cursor-pointer border-b border-[var(--color-border-tertiary)] hover:bg-[var(--color-surface-secondary)]"
                      onClick={() =>
                        setSelectedCr({
                          projectId,
                          changeRequestId: cr.id,
                        })
                      }
                    >
                      <td
                        className="py-2 font-mono text-[12px]"
                        style={{ color: tokens.colorTeal600 }}
                      >
                        {cr.changeNumber}
                      </td>
                      <td className="py-2 text-[13px] text-[var(--color-text-primary)]">
                        {cr.title}
                      </td>
                      <td className="py-2">
                        <StatusBadge
                          label={formatChangeRequestStatus(cr.status)}
                          variant={changeRequestStatusVariant(cr.status)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={layout.drawerMutedText}>No linked change requests.</p>
            )}
          </section>

          {issue.status === 'CLOSED' && issue.resolutionNote && (
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Resolution</p>
              <div className={layout.drawerSurface}>
                <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                  {issue.resolutionNote}
                </p>
              </div>
            </section>
          )}

          {(canClose || canReopen) && (
            <section className={layout.drawerSection}>
              <div className="flex flex-col gap-2">
                {canClose && (
                  <Button
                    type="primary"
                    block
                    onClick={() => setCloseOpen(true)}
                  >
                    Close Issue
                  </Button>
                )}
                {canReopen && (
                  <Button block onClick={() => setReopenOpen(true)}>
                    Reopen Issue
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal
        title="Add Response"
        open={responseModalOpen}
        onCancel={closeResponseModal}
        onOk={() => void form.submit()}
        okText="Post Response"
        confirmLoading={addResponse.isPending || uploading}
        destroyOnHidden
      >
        <Form<ResponseFormValues>
          form={form}
          layout="vertical"
          className="erp-drawer-form mt-2"
          onFinish={(values: ResponseFormValues) => void handleAddResponse(values)}
        >
          <Form.Item
            label="Response"
            name="responseText"
            rules={[{ required: true, message: 'Enter a response' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Type your response here..."
            />
          </Form.Item>
          <Form.Item label="Attach file (optional)">
            {!responseDocId ? (
              <Upload
                maxCount={1}
                beforeUpload={(file) => {
                  setResponseFile(file);
                  void uploadResponseFile(file);
                  return false;
                }}
                showUploadList={false}
              >
                <Button icon={<UploadOutlined />} loading={uploading}>
                  {responseFile ? responseFile.name : 'Choose file'}
                </Button>
              </Upload>
            ) : (
              <Space>
                <CheckCircleOutlined style={{ color: 'green' }} />
                <span>{uploadedFileName}</span>
                <Button
                  size="small"
                  type="link"
                  danger
                  onClick={() => resetResponseAttachment()}
                >
                  Remove
                </Button>
              </Space>
            )}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Close Issue"
        open={closeOpen}
        onCancel={() => {
          setCloseOpen(false);
          setResolutionNote('');
        }}
        onOk={() => void handleClose()}
        okText="Close Issue"
        confirmLoading={closeIssue.isPending}
        destroyOnHidden
      >
        <Form layout="vertical" className="mt-2">
          <Form.Item label="Resolution note" required>
            <Input.TextArea
              rows={4}
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Describe what was done to resolve this issue"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Reopen Issue"
        open={reopenOpen}
        onCancel={() => {
          setReopenOpen(false);
          setReopenReason('');
        }}
        onOk={() => void handleReopen()}
        okText="Reopen"
        confirmLoading={reopenIssue.isPending}
        destroyOnHidden
      >
        <Form layout="vertical" className="mt-2">
          <Form.Item label="Reason" required>
            <Input.TextArea
              rows={3}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <CreateChangeRequestDrawer
        open={createCrOpen}
        projectId={projectId}
        initialLinkedDesignPackageId={issue?.linkedDesignPackageId ?? undefined}
        onClose={() => setCreateCrOpen(false)}
        onCreated={(created) => void handleCrCreated(created)}
      />

      {selectedCr && (
        <ChangeRequestDrawer
          projectId={selectedCr.projectId}
          changeRequestId={selectedCr.changeRequestId}
          onClose={() => setSelectedCr(null)}
          onUpdated={() => void issueQuery.refetch()}
        />
      )}
    </Drawer>
  );
}
