'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
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
  UploadOutlined,
} from '@ant-design/icons';
import { MessageSquare } from 'lucide-react';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { apiGet } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { ISSUE_WORKFLOW } from '@/lib/api/workflow';
import { useAppMessage } from '@/hooks/use-app-message';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import {
  useAddIssueResponse,
  useCloseIssue,
  useIssue,
  useIssueResponses,
  useReopenIssue,
  useResolveIssue,
  useStartIssue,
} from '@/lib/query/issues';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  issueSeverityVariant,
  issueStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';

interface ResponseFormValues {
  responseText: string;
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
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const open = Boolean(issueId);

  const issueQuery = useIssue(projectId, issueId ?? '', open);
  const responsesQuery = useIssueResponses(projectId, issueId ?? '', open);
  const startIssue = useStartIssue();
  const resolveIssue = useResolveIssue();
  const closeIssue = useCloseIssue();
  const reopenIssue = useReopenIssue();
  const addResponse = useAddIssueResponse();
  const uploadDocument = useUploadDocumentToFolder();

  const [form] = Form.useForm<ResponseFormValues>();
  const [startAssignee, setStartAssignee] = useState<string | undefined>();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [responseDocId, setResponseDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const issue = issueQuery.data;
  const responses = responsesQuery.data ?? [];
  const hasFullAccess = pm.projects.canView;
  const isRaisedByMe = issue?.raisedBy === currentUserId;
  const isAssignedToMe = issue?.assignedTo === currentUserId;

  const canStart = issue?.status === 'OPEN';
  const canResolve =
    issue?.status === 'IN_PROGRESS' && (isAssignedToMe || hasFullAccess);
  const canClose =
    issue?.status === 'RESOLVED' && (isRaisedByMe || hasFullAccess);
  const canReopenFromResolved =
    issue?.status === 'RESOLVED' && (isRaisedByMe || hasFullAccess);
  const canReopenFromClosed =
    issue?.status === 'CLOSED' && (isRaisedByMe || hasFullAccess);
  const canRespond =
    issue != null &&
    issue.status !== 'CLOSED' &&
    (isAssignedToMe || hasFullAccess);

  function resetResponseAttachment(): void {
    setResponseFile(null);
    setResponseDocId(null);
    setUploadedFileName(null);
    setUploading(false);
  }

  useEffect(() => {
    if (!open) {
      form.resetFields();
      resetResponseAttachment();
      setStartAssignee(undefined);
      setResolveOpen(false);
      setResolveNote('');
      setReopenOpen(false);
      setReopenReason('');
    }
  }, [open, form]);

  useEffect(() => {
    if (issue?.assignedTo) {
      setStartAssignee(issue.assignedTo);
    }
  }, [issue?.assignedTo]);

  async function refresh(): Promise<void> {
    onUpdated();
    await Promise.all([issueQuery.refetch(), responsesQuery.refetch()]);
  }

  async function handleStart(): Promise<void> {
    if (!issueId) {
      return;
    }
    try {
      await startIssue.mutateAsync({
        projectId,
        issueId,
        body: { assignedTo: startAssignee },
      });
      messageApi.success('Issue started');
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to start issue', messageApi);
    }
  }

  async function handleResolve(): Promise<void> {
    if (!issueId) {
      return;
    }
    const note = resolveNote.trim();
    if (!note) {
      messageApi.error('Enter a resolution note');
      return;
    }
    try {
      await resolveIssue.mutateAsync({
        projectId,
        issueId,
        body: { resolutionNote: note },
      });
      messageApi.success('Issue marked resolved');
      setResolveOpen(false);
      setResolveNote('');
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to resolve issue', messageApi);
    }
  }

  async function handleClose(): Promise<void> {
    if (!issueId) {
      return;
    }
    try {
      await closeIssue.mutateAsync({ projectId, issueId });
      messageApi.success('Issue closed');
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
      form.resetFields();
      resetResponseAttachment();
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
      title={issue ? `${issue.issueNumber} - ${issue.issueType}` : 'Issue detail'}
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
          <WorkflowStepper
            className="erp-drawer-workflow"
            steps={ISSUE_WORKFLOW}
            currentStatus={issue.status}
          />

          <Descriptions
            className={layout.drawerDescriptionsClass}
            column={1}
            size="small"
            bordered
          >
            <Descriptions.Item label="Status">
              <StatusBadge
                label={formatIssueStatus(issue.status)}
                variant={issueStatusVariant(issue.status)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Severity">
              <StatusBadge
                label={issue.severity}
                variant={issueSeverityVariant(issue.severity)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Location">
              {issue.location ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Raised by">
              {resolveUserDisplay(issue.raisedBy, issue.raisedByName)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {resolveUserDisplay(issue.assignedTo, issue.assignedToName, '-')}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(issue.dueDate)}
            </Descriptions.Item>
            {(issue.status === 'RESOLVED' || issue.status === 'CLOSED') && (
              <>
                <Descriptions.Item label="Resolution">
                  {issue.resolutionNote ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Resolved by">
                  {resolveUserDisplay(
                    issue.resolvedBy,
                    issue.resolvedByName,
                    '—',
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Resolved on">
                  {issue.resolvedAt
                    ? formatProjectDate(issue.resolvedAt)
                    : '—'}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="Description">
              {issue.description}
            </Descriptions.Item>
            {issue.sourceEntitySummary && (
              <Descriptions.Item label="Source">
                {issue.sourceEntitySummary.type.replace(/_/g, ' ')} —{' '}
                {issue.sourceEntitySummary.label}
              </Descriptions.Item>
            )}
          </Descriptions>

          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>Actions</p>
            <Space wrap>
              {canStart && (
                <>
                  {!issue.assignedTo && (
                    <UserSelect
                      className="min-w-[220px]"
                      placeholder="Assign before starting"
                      value={startAssignee}
                      onChange={(value: string | undefined) =>
                        setStartAssignee(value)
                      }
                    />
                  )}
                  <Button
                    type="primary"
                    loading={startIssue.isPending}
                    onClick={() => void handleStart()}
                  >
                    Start / Assign
                  </Button>
                </>
              )}
              {canResolve && (
                <Button
                  type="primary"
                  loading={resolveIssue.isPending}
                  onClick={() => setResolveOpen(true)}
                >
                  Mark Resolved
                </Button>
              )}
              {canClose && (
                <Button
                  type="primary"
                  loading={closeIssue.isPending}
                  onClick={() => void handleClose()}
                >
                  Close Issue
                </Button>
              )}
              {(canReopenFromResolved || canReopenFromClosed) && (
                <Button onClick={() => setReopenOpen(true)}>
                  {issue.status === 'CLOSED' ? 'Reopen Issue' : 'Reopen'}
                </Button>
              )}
            </Space>
          </section>

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Responses</h3>
            {responses.length === 0 ? (
              <TableEmptyState
                icon={<MessageSquare />}
                title="No responses yet"
                description="Conversation between raiser and assignee will appear here"
              />
            ) : (
              <ul className="erp-drawer-list">
                {responses.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className={layout.drawerHeading}>
                        {resolveUserDisplay(item.respondedBy, item.respondedByName)}
                      </span>
                      <span className={layout.drawerMetaLabel}>
                        {formatProjectDate(item.respondedAt)}
                      </span>
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
                          📎 {item.responseDocumentName ?? 'Attachment'}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canRespond ? (
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
                  <Input.TextArea rows={3} placeholder="Response text" />
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
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={addResponse.isPending || uploading}
                >
                  Post response
                </Button>
              </Form>
            ) : (
              <Alert
                type="info"
                showIcon
                className="mt-4"
                description={
                  issue.status === 'CLOSED'
                    ? 'This issue is closed — no further responses can be posted.'
                    : 'Only the raiser or assignee can post responses.'
                }
              />
            )}
          </section>

          <DocumentAttachmentPanel
            folderId={issue.attachmentFolderId ?? undefined}
            title="Photos & drawings"
            description="Upload site photos, sketches, or drawing references for this issue."
          />

          <Alert
            type="info"
            showIcon
            className="mt-4"
            title="EPC revision"
            description="For defects tied to engineering documents, use Trigger Revision from the engineering document detail page after linking the issue in correspondence."
          />
        </div>
      )}

      <Modal
        title="Mark issue resolved"
        open={resolveOpen}
        onCancel={() => {
          setResolveOpen(false);
          setResolveNote('');
        }}
        onOk={() => void handleResolve()}
        okText="Mark Resolved"
        confirmLoading={resolveIssue.isPending}
        destroyOnHidden
      >
        <p className={`mb-2 ${layout.drawerMutedText}`}>
          Describe what was done to resolve this issue
        </p>
        <Input.TextArea
          rows={4}
          value={resolveNote}
          onChange={(event) => setResolveNote(event.target.value)}
          placeholder="Resolution details"
        />
      </Modal>

      <Modal
        title="Reopen issue"
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
        <p className={`mb-2 ${layout.drawerMutedText}`}>
          Explain why this issue is being reopened
        </p>
        <Input.TextArea
          rows={4}
          value={reopenReason}
          onChange={(event) => setReopenReason(event.target.value)}
          placeholder="Reopen reason"
        />
      </Modal>
    </Drawer>
  );
}
