'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
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
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { apiGet } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useAppMessage } from '@/hooks/use-app-message';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import {
  useAddIssueResponse,
  useCloseIssue,
  useIssue,
  useIssueResponses,
  useReopenIssue,
} from '@/lib/query/issues';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
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

function DetailCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className={`mb-0.5 ${layout.drawerMetaLabel}`}>{label}</p>
      <div className={layout.drawerMutedText}>{children}</div>
    </div>
  );
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

  const issue = issueQuery.data;
  const responses = responsesQuery.data ?? [];

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

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={issue ? issue.issueType : 'Issue detail'}
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
          {/* SECTION 1 — HEADER */}
          <section>
            <div className="mb-2 flex items-start justify-between gap-3">
              <span
                className="text-[15px] font-semibold leading-tight"
                style={{ color: tokens.colorTeal600 }}
              >
                {issue.issueNumber}
              </span>
              <StatusBadge
                label={formatIssueStatus(issue.status)}
                variant={issueStatusVariant(issue.status)}
              />
            </div>
            <Space size={8} wrap>
              <StatusBadge label={issue.issueType} variant="default" />
              <StatusBadge
                label={issue.severity}
                variant={issueSeverityVariant(issue.severity)}
              />
            </Space>
          </section>

          {/* SECTION 2 — DETAILS */}
          <section className={layout.drawerSection}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailCell label="Raised by">
                {resolveUserDisplay(issue.raisedBy, issue.raisedByName)}
              </DetailCell>
              <DetailCell label="Assigned to">
                {resolveUserDisplay(issue.assignedTo, issue.assignedToName, '—')}
              </DetailCell>
              <DetailCell label="Date raised">
                {formatProjectDate(issue.createdAt)}
              </DetailCell>
              <DetailCell label="Due date">
                {formatProjectDate(issue.dueDate)}
              </DetailCell>
              <DetailCell label="Subtask">
                {issue.linkedDesignPackage
                  ? `${issue.linkedDesignPackage.fullCode} ${issue.linkedDesignPackage.name}`
                  : '—'}
              </DetailCell>
              <DetailCell label="Location">
                {issue.location ?? '—'}
              </DetailCell>
              {issue.sourceEntitySummary && (
                <>
                  <DetailCell label="Source type">
                    {issue.sourceEntitySummary.type.replace(/_/g, ' ')}
                  </DetailCell>
                  <DetailCell label="Source entity">
                    {issue.sourceEntitySummary.label}
                  </DetailCell>
                </>
              )}
            </div>
          </section>

          {/* SECTION 3 — DESCRIPTION */}
          <section className={layout.drawerSection}>
            <p className={`mb-1 ${layout.drawerHeading}`}>Description</p>
            <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
              {issue.description}
            </p>
          </section>

          {/* SECTION 4 — DISCUSSION */}
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

          {/* SECTION 5 — RESOLUTION */}
          {issue.status === 'CLOSED' && (
            <section
              className="rounded-lg border p-4"
              style={{
                borderColor: tokens.colorTeal400,
                backgroundColor: tokens.colorTeal50,
              }}
            >
              <p className={`mb-2 ${layout.drawerHeading}`}>Resolution</p>
              <p className={`mb-3 whitespace-pre-wrap ${layout.drawerMutedText}`}>
                {issue.resolutionNote ?? '—'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <DetailCell label="Closed by">
                  {resolveUserDisplay(
                    issue.resolvedBy,
                    issue.resolvedByName,
                    '—',
                  )}
                </DetailCell>
                <DetailCell label="Closed on">
                  {issue.resolvedAt
                    ? formatProjectDate(issue.resolvedAt)
                    : '—'}
                </DetailCell>
              </div>
            </section>
          )}

          {/* SECTION 6 — ACTIONS */}
          {(canClose || canReopen) && (
            <section className={layout.drawerSection}>
              <Space wrap>
                {canClose && (
                  <Button type="primary" onClick={() => setCloseOpen(true)}>
                    Close Issue
                  </Button>
                )}
                {canReopen && (
                  <Button onClick={() => setReopenOpen(true)}>Reopen</Button>
                )}
              </Space>
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
    </Drawer>
  );
}
