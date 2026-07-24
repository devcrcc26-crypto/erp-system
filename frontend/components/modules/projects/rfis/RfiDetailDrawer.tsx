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
  Typography,
  Upload,
} from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { MessageSquare } from 'lucide-react';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import TableEmptyState from '@/components/ui/TableEmptyState';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { apiGet } from '@/lib/api/client';
import type { RfiSource } from '@/lib/api/project-management.types';
import type { ProjectChangeRequest } from '@/lib/api/project-management.types';
import { RFI_WORKFLOW } from '@/lib/api/workflow';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import {
  useAddRfiResponse,
  useCloseRfi,
  useLinkRfiCr,
  useReopenRfi,
  useRfi,
  useRfiResponses,
} from '@/lib/query/rfis';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRfiStatus,
  isOverdue,
  rfiPriorityVariant,
  rfiStatusVariant,
} from '@/lib/utils/pm-status-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcCapabilities, usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';
import CreateChangeRequestDrawer from '@/components/modules/projects/change-requests/CreateChangeRequestDrawer';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';
import { tokens } from '@/lib/theme/tokens';

const RFI_SOURCE_LABELS: Record<RfiSource, string> = {
  SITE_TEAM: 'Site Team',
  CONTRACTOR: 'Contractor',
  CLIENT_CONSULTANT: 'Client / Consultant',
  INTER_DISCIPLINE: 'Inter-discipline',
};

interface ResponseFormValues {
  responseText: string;
}

async function downloadResponseDocument(documentId: string): Promise<void> {
  const { url } = await apiGet<{ url: string; expiresIn: number }>(
    `/documents/${documentId}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
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
  const resolveUserDisplay = useUserDisplayResolver();
  const open = Boolean(rfiId);

  const [createCrOpen, setCreateCrOpen] = useState(false);
  const [selectedCr, setSelectedCr] = useState<{
    projectId: string;
    changeRequestId: string;
  } | null>(null);
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [responseDocId, setResponseDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const rfiQuery = useRfi(projectId, rfiId ?? '', open);
  const responsesQuery = useRfiResponses(projectId, rfiId ?? '', open);
  const addResponse = useAddRfiResponse();
  const uploadDocument = useUploadDocumentToFolder();
  const linkRfiCr = useLinkRfiCr();
  const closeRfi = useCloseRfi();
  const reopenRfi = useReopenRfi();
  const messageApi = useAppMessage();
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const rfi = rfiQuery.data;
  const responses = responsesQuery.data ?? [];
  const canRespond =
    Boolean(rfi?.assignedTo) &&
    rfi?.assignedTo === currentUserId &&
    rfi?.status !== 'CLOSED' &&
    rfi?.status !== 'ANSWERED';
  const isRaisedByMe = rfi?.raisedBy === currentUserId;
  const hasFullAccess = pm.projects.canView;
  const canClose =
    rfi?.status === 'ANSWERED' && (isRaisedByMe || hasFullAccess);
  const canReopen =
    rfi?.status === 'CLOSED' && (isRaisedByMe || hasFullAccess);

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
    }
  }, [open, form]);

  async function uploadResponseFile(file: File): Promise<string | null> {
    if (!rfi?.attachmentFolderId) {
      messageApi.error(
        'RFI has no attachment folder. Save the RFI before attaching files.',
      );
      return null;
    }
    setUploading(true);
    try {
      const uploaded = await uploadDocument.mutateAsync({
        folderId: rfi.attachmentFolderId,
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

  async function handleClose(): Promise<void> {
    if (!rfiId) {
      return;
    }
    try {
      await closeRfi.mutateAsync({ projectId, rfiId });
      messageApi.success('RFI closed');
      onUpdated();
      void rfiQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to close RFI', messageApi);
    }
  }

  async function handleReopen(): Promise<void> {
    if (!rfiId) {
      return;
    }
    try {
      await reopenRfi.mutateAsync({ projectId, rfiId });
      messageApi.success('RFI reopened');
      onUpdated();
      void rfiQuery.refetch();
      void responsesQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to reopen RFI', messageApi);
    }
  }

  async function handleAddResponse(values: ResponseFormValues): Promise<void> {
    if (!rfiId) {
      return;
    }
    try {
      let documentId = responseDocId;

      if (responseFile && !documentId) {
        documentId = await uploadResponseFile(responseFile);
        if (!documentId) {
          return;
        }
      }

      await addResponse.mutateAsync({
        projectId,
        rfiId,
        body: {
          responseText: values.responseText.trim(),
          ...(documentId ? { responseDocumentId: documentId } : {}),
        },
      });
      messageApi.success('Response posted successfully');
      form.resetFields();
      resetResponseAttachment();
      onUpdated();
      void responsesQuery.refetch();
      void rfiQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to post RFI response', messageApi);
    }
  }

  async function handleCrCreated(created?: ProjectChangeRequest): Promise<void> {
    setCreateCrOpen(false);
    if (created && rfiId) {
      try {
        await linkRfiCr.mutateAsync({
          projectId,
          rfiId,
          crId: created.id,
        });
        void rfiQuery.refetch();
        onUpdated();
      } catch (error) {
        notifyApiError(error, 'Change request created but linking failed', messageApi);
      }
    } else {
      void rfiQuery.refetch();
      onUpdated();
    }
  }

  const showRaiseCrButton =
    rfi?.status === 'ANSWERED' && !rfi?.linkedCrId;

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={rfi ? `${rfi.rfiNumber} — ${rfi.title}` : 'RFI detail'}
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
            <Descriptions.Item label="RFI Number">
              <Typography.Text strong>{rfi.rfiNumber}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <StatusBadge
                label={formatRfiStatus(rfi.status)}
                variant={rfiStatusVariant(rfi.status)}
              />
            </Descriptions.Item>
            {rfi.rfiSource && (
              <Descriptions.Item label="Source">
                {RFI_SOURCE_LABELS[rfi.rfiSource] ?? rfi.rfiSource}
              </Descriptions.Item>
            )}
            {rfi.linkedDesignPackage && (
              <Descriptions.Item label="Subtask">
                <Typography.Text code>
                  {rfi.linkedDesignPackage.fullCode}
                </Typography.Text>{' '}
                {rfi.linkedDesignPackage.name}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Assigned to">
              {resolveUserDisplay(rfi.assignedTo, rfi.assignedToName, '—')}
            </Descriptions.Item>
            <Descriptions.Item label="Raised by">
              {resolveUserDisplay(rfi.raisedBy, rfi.raisedByName)}
            </Descriptions.Item>
            <Descriptions.Item label="Priority">
              <StatusBadge
                label={rfi.priority}
                variant={rfiPriorityVariant(rfi.priority)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Date raised">
              {formatProjectDate(rfi.dateRaised)}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              <span
                style={
                  isOverdue(rfi.dueDate) && rfi.status !== 'CLOSED'
                    ? { color: tokens.colorRed600, fontWeight: 500 }
                    : undefined
                }
              >
                {formatProjectDate(rfi.dueDate)}
              </span>
            </Descriptions.Item>
            {rfi.dateAnswered && (
              <Descriptions.Item label="Date answered">
                {formatProjectDate(rfi.dateAnswered)}
              </Descriptions.Item>
            )}
            {rfi.description && (
              <Descriptions.Item label="Description">
                <span className="whitespace-pre-wrap">{rfi.description}</span>
              </Descriptions.Item>
            )}
            {rfi.sourceEntitySummary && (
              <Descriptions.Item label="Source entity">
                {rfi.sourceEntitySummary.type.replace(/_/g, ' ')} —{' '}
                {rfi.sourceEntitySummary.label}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Linked CR">
              {rfi.linkedCrId ? (
                <Button
                  type="link"
                  className="!px-0"
                  style={{ color: tokens.colorTeal600 }}
                  onClick={() =>
                    setSelectedCr({
                      projectId,
                      changeRequestId: rfi.linkedCrId as string,
                    })
                  }
                >
                  {rfi.linkedCrNumber ?? rfi.linkedCrId}
                </Button>
              ) : (
                '—'
              )}
            </Descriptions.Item>
          </Descriptions>

          {(canClose || canReopen) && (
            <section className={layout.drawerSection}>
              <Space>
                {canClose && (
                  <Button
                    type="primary"
                    onClick={() => void handleClose()}
                    loading={closeRfi.isPending}
                  >
                    Close RFI
                  </Button>
                )}
                {canReopen && (
                  <Button
                    onClick={() =>
                      Modal.confirm({
                        title: 'Reopen this RFI?',
                        content:
                          'The status will return to Submitted and the assignee can add a new response.',
                        okText: 'Reopen',
                        onOk: () => handleReopen(),
                      })
                    }
                    loading={reopenRfi.isPending}
                  >
                    Reopen RFI
                  </Button>
                )}
              </Space>
            </section>
          )}

          {showRaiseCrButton && (
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Change Request</p>
              <Alert
                type="info"
                showIcon
                className="!mb-3"
                description="If this RFI requires a design change, raise a CR to formally trigger the revision workflow."
              />
              <Button
                type="primary"
                onClick={() => setCreateCrOpen(true)}
                loading={linkRfiCr.isPending}
              >
                Raise Change Request
              </Button>
            </section>
          )}

          {rfi.linkedCrId && (
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Linked Change Request</p>
              <Button
                type="link"
                className="!px-0"
                style={{ color: tokens.colorTeal600 }}
                onClick={() =>
                  setSelectedCr({
                    projectId,
                    changeRequestId: rfi.linkedCrId as string,
                  })
                }
              >
                {rfi.linkedCrNumber ?? rfi.linkedCrId}
              </Button>
            </section>
          )}

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>Responses</h3>
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
                  <Input.TextArea rows={3} placeholder="Official response text" />
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
                        onClick={() => {
                          setResponseFile(null);
                          setResponseDocId(null);
                          setUploadedFileName(null);
                        }}
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
                  !rfi.assignedTo
                    ? 'Assign a designer on this RFI before an official response can be posted.'
                    : rfi.status === 'CLOSED'
                      ? 'This RFI is closed — no further responses can be posted.'
                      : rfi.status === 'ANSWERED'
                        ? 'This RFI has been answered. Reopen it to add another response.'
                        : 'Only the assigned designer can post an official response.'
                }
              />
            )}
          </section>

          <DocumentAttachmentPanel
            folderId={rfi.attachmentFolderId ?? undefined}
            title="Attachments"
            description="Files attached to this RFI."
            readOnly={true}
          />
        </div>
      )}

      <CreateChangeRequestDrawer
        open={createCrOpen}
        projectId={projectId}
        initialLinkedDesignPackageId={rfi?.linkedDesignPackageId ?? undefined}
        onClose={() => setCreateCrOpen(false)}
        onCreated={(created) => void handleCrCreated(created)}
      />

      {selectedCr && (
        <ChangeRequestDrawer
          projectId={selectedCr.projectId}
          changeRequestId={selectedCr.changeRequestId}
          onClose={() => setSelectedCr(null)}
          onUpdated={() => void rfiQuery.refetch()}
        />
      )}
    </Drawer>
  );
}
