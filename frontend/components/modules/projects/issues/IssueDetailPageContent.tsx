'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Skeleton,
  Space,
  Tabs,
  Upload,
} from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
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
import { layout } from '@/lib/theme/layout';
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

export default function IssueDetailPageContent({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}): React.ReactNode {
  const router = useRouter();
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const issueQuery = useIssue(projectId, issueId);
  const responsesQuery = useIssueResponses(projectId, issueId);
  const closeIssue = useCloseIssue();
  const reopenIssue = useReopenIssue();
  const addResponse = useAddIssueResponse();
  const uploadDocument = useUploadDocumentToFolder();
  const linkIssueCr = useLinkIssueCr();

  const [activeTab, setActiveTab] = useState('overview');
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

  const issue = issueQuery.data;
  const responses = responsesQuery.data ?? [];

  const linkedCrs = useMemo(() => issue?.linkedCrs ?? [], [issue]);

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
  const showWaitingAlert = responses.length === 0 && issue?.status === 'OPEN';

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
    form.resetFields();
    resetResponseAttachment();
    setResponseModalOpen(false);
    setCloseOpen(false);
    setResolutionNote('');
    setReopenOpen(false);
    setReopenReason('');
    setCreateCrOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  async function refresh(): Promise<void> {
    await Promise.all([issueQuery.refetch(), responsesQuery.refetch()]);
  }

  async function handleClose(): Promise<void> {
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
    if (created) {
      try {
        await linkIssueCr.mutateAsync({
          projectId,
          issueId,
          crId: created.id,
        });
        void issueQuery.refetch();
      } catch (error) {
        notifyApiError(error, 'Change request created but linking failed', messageApi);
      }
    } else {
      void issueQuery.refetch();
    }
  }

  if (issueQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (issueQuery.isError || !issue) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load issue"
        description={
          issueQuery.error instanceof ApiRequestError
            ? issueQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  return (
    <div className={layout.pageStack}>
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/issues`)}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to issues
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {issue.issueNumber}
          </h1>
          <span className="max-w-[320px] truncate text-sm text-[var(--color-text-secondary)]">
            {issue.issueType}
          </span>
          <StatusBadge
            label={formatIssueStatus(issue.status)}
            variant={issueStatusVariant(issue.status)}
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
            children: (
              <div className="flex flex-col gap-6">
                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <Descriptions
                    className={layout.drawerDescriptionsClass}
                    column={{ xs: 1, sm: 2 }}
                    size="small"
                    bordered
                  >
                    <Descriptions.Item label="Issue Number">
                      {issue.issueNumber}
                    </Descriptions.Item>
                    <Descriptions.Item label="Issue Type">
                      {issue.issueType ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Raised By">
                      {issue.raisedByName ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Assigned To">
                      {issue.assignedToName ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Severity">
                      <StatusBadge
                        label={issue.severity}
                        variant={issueSeverityVariant(issue.severity)}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <StatusBadge
                        label={formatIssueStatus(issue.status)}
                        variant={issueStatusVariant(issue.status)}
                      />
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
                </div>

                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <p className={`mb-2 ${layout.drawerHeading}`}>Description</p>
                  <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                    {issue.description}
                  </p>
                </div>

                {issue.status === 'CLOSED' && issue.resolutionNote && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className={`mb-2 ${layout.drawerHeading}`}>Resolution</p>
                    <p className="whitespace-pre-wrap text-[12px] text-green-800">
                      {issue.resolutionNote}
                    </p>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'discussion',
            label: 'Discussion',
            children: (
              <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                {showWaitingAlert && (
                  <Alert
                    type="info"
                    showIcon
                    className="mb-3"
                    description="No responses yet."
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
              </div>
            ),
          },
          {
            key: 'linked-crs',
            label: 'Linked Change Requests',
            children: (
              <div className={layout.cardSurface + ' ' + layout.cardPadding}>
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
                            router.push(`/projects/${projectId}/change-requests/${cr.id}`)
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
              </div>
            ),
          },
          {
            key: 'files',
            label: 'Files',
            children: (
              <DocumentAttachmentPanel
                folderId={issue.attachmentFolderId ?? undefined}
                readOnly={issue.status === 'CLOSED'}
                title="Issue files"
                description="Photos and supporting documents for this issue."
              />
            ),
          },
        ]}
      />

      {/* Sticky bottom workflow bar */}
      {(canClose || canReopen) && (
        <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
          <div className="flex flex-col gap-2">
            {canClose && (
              <Button type="primary" block onClick={() => setCloseOpen(true)}>
                Close Issue
              </Button>
            )}
            {canReopen && (
              <Button block onClick={() => setReopenOpen(true)}>
                Reopen Issue
              </Button>
            )}
          </div>
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
        initialLinkedDesignPackageId={issue.linkedDesignPackageId ?? undefined}
        onClose={() => setCreateCrOpen(false)}
        onCreated={(created) => void handleCrCreated(created)}
      />
    </div>
  );
}
