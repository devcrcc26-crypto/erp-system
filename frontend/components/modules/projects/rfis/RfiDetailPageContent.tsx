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
import { ApiRequestError } from '@/lib/api/errors';
import { apiGet } from '@/lib/api/client';
import type {
  ChangeRequestStatus,
  ProjectChangeRequest,
  RfiSource,
} from '@/lib/api/project-management.types';
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
  changeRequestStatusVariant,
  formatChangeRequestStatus,
  formatRfiStatus,
  isOverdue,
  rfiPriorityVariant,
  rfiStatusVariant,
} from '@/lib/utils/pm-status-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';
import CreateChangeRequestDrawer from '@/components/modules/projects/change-requests/CreateChangeRequestDrawer';
import { tokens } from '@/lib/theme/tokens';

dayjs.extend(relativeTime);

const RFI_SOURCE_LABELS: Record<RfiSource, string> = {
  SITE_TEAM: 'Site Team',
  CONTRACTOR: 'Contractor',
  CLIENT_CONSULTANT: 'Client / Consultant',
  INTER_DISCIPLINE: 'Inter-discipline',
};

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

function formatRfiSource(source: RfiSource | null): string | null {
  if (!source) {
    return null;
  }
  return RFI_SOURCE_LABELS[source] ?? source;
}

function responseAvatarColor(
  respondedBy: string,
  assignedTo: string | null,
  raisedBy: string,
): string {
  if (assignedTo && respondedBy === assignedTo) {
    return tokens.colorTeal600;
  }
  if (respondedBy === raisedBy) {
    return tokens.colorGray600;
  }
  return tokens.colorBlue400;
}

async function downloadResponseDocument(documentId: string): Promise<void> {
  const { url } = await apiGet<{ url: string; expiresIn: number }>(
    `/documents/${documentId}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function RfiDetailPageContent({
  projectId,
  rfiId,
}: {
  projectId: string;
  rfiId: string;
}): React.ReactNode {
  const router = useRouter();
  const [form] = Form.useForm<ResponseFormValues>();
  const resolveUserDisplay = useUserDisplayResolver();

  const [activeTab, setActiveTab] = useState('overview');
  const [createCrOpen, setCreateCrOpen] = useState(false);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [responseDocId, setResponseDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const rfiQuery = useRfi(projectId, rfiId);
  const responsesQuery = useRfiResponses(projectId, rfiId);
  const addResponse = useAddRfiResponse();
  const uploadDocument = useUploadDocumentToFolder();
  const linkRfiCr = useLinkRfiCr();
  const closeRfi = useCloseRfi();
  const reopenRfi = useReopenRfi();
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const rfi = rfiQuery.data;
  const responses = responsesQuery.data ?? [];

  const linkedCrs = useMemo(() => {
    if (!rfi) {
      return [];
    }
    if (rfi.linkedCrs && rfi.linkedCrs.length > 0) {
      return rfi.linkedCrs;
    }
    if (rfi.linkedCrId) {
      return [
        {
          id: rfi.linkedCrId,
          changeNumber: rfi.linkedCrNumber ?? rfi.linkedCrId,
          title: '-',
          status: 'SUBMITTED' as ChangeRequestStatus,
        },
      ];
    }
    return [];
  }, [rfi]);

  const canRespond =
    rfi != null &&
    rfi.status !== 'CLOSED' &&
    (currentUserId === rfi.raisedBy ||
      currentUserId === rfi.assignedTo ||
      pm.projects.canView);
  const isRaisedByMe = rfi?.raisedBy === currentUserId;
  const canClose =
    rfi?.status === 'ANSWERED' && (isRaisedByMe || pm.projects.canView);
  const canReopen =
    rfi?.status === 'CLOSED' && (isRaisedByMe || pm.projects.canView);
  const canRaiseCr = rfi?.status === 'ANSWERED';
  const showWaitingAlert =
    responses.length === 0 &&
    (rfi?.status === 'SUBMITTED' ||
      (rfi?.status as string | undefined) === 'OPEN');
  const showLifecycleActions = canClose || canReopen;

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
    resetResponseAttachment();
    setResponseModalOpen(false);
  }, [rfiId]);

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
    try {
      await closeRfi.mutateAsync({ projectId, rfiId });
      messageApi.success('RFI closed');
      void rfiQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to close RFI', messageApi);
    }
  }

  async function handleReopen(): Promise<void> {
    try {
      await reopenRfi.mutateAsync({ projectId, rfiId });
      messageApi.success('RFI reopened');
      void rfiQuery.refetch();
      void responsesQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to reopen RFI', messageApi);
    }
  }

  async function handleAddResponse(values: ResponseFormValues): Promise<void> {
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
      closeResponseModal();
      void responsesQuery.refetch();
      void rfiQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to post RFI response', messageApi);
    }
  }

  async function handleCrCreated(created?: ProjectChangeRequest): Promise<void> {
    setCreateCrOpen(false);
    if (created) {
      try {
        await linkRfiCr.mutateAsync({
          projectId,
          rfiId,
          crId: created.id,
        });
        void rfiQuery.refetch();
      } catch (error) {
        notifyApiError(error, 'Change request created but linking failed', messageApi);
      }
    } else {
      void rfiQuery.refetch();
    }
  }

  if (rfiQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (rfiQuery.isError || !rfi) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load RFI"
        description={
          rfiQuery.error instanceof ApiRequestError
            ? rfiQuery.error.message
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
            onClick={() => router.push(`/projects/${projectId}/rfis`)}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to RFIs
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {rfi.rfiNumber}
          </h1>
          <span className="max-w-[320px] truncate text-sm text-[var(--color-text-secondary)]">
            {rfi.title}
          </span>
          <StatusBadge
            label={formatRfiStatus(rfi.status)}
            variant={rfiStatusVariant(rfi.status)}
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
                    <Descriptions.Item label="RFI Number">
                      {rfi.rfiNumber}
                    </Descriptions.Item>
                    <Descriptions.Item label="Title">
                      {rfi.title}
                    </Descriptions.Item>
                    <Descriptions.Item label="Raised By">
                      {rfi.raisedByName ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Assigned To">
                      {rfi.assignedToName ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Source">
                      {formatRfiSource(rfi.rfiSource) ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Priority">
                      <StatusBadge
                        label={rfi.priority}
                        variant={rfiPriorityVariant(rfi.priority)}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <StatusBadge
                        label={formatRfiStatus(rfi.status)}
                        variant={rfiStatusVariant(rfi.status)}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Date Raised">
                      {formatProjectDate(rfi.dateRaised ?? rfi.createdAt)}
                    </Descriptions.Item>
                    {rfi.dueDate && (
                      <Descriptions.Item label="Due Date">
                        <span
                          className={
                            isOverdue(rfi.dueDate) && rfi.status !== 'CLOSED'
                              ? 'font-medium text-red-600'
                              : ''
                          }
                        >
                          {formatProjectDate(rfi.dueDate)}
                        </span>
                      </Descriptions.Item>
                    )}
                    {rfi.linkedDesignPackage && (
                      <Descriptions.Item label="Subtask">
                        {rfi.linkedDesignPackage.fullCode} -{' '}
                        {rfi.linkedDesignPackage.name}
                      </Descriptions.Item>
                    )}
                    {rfi.sourceEntityType && (
                      <Descriptions.Item label="Source Type">
                        {rfi.sourceEntityType.replace(/_/g, ' ')}
                      </Descriptions.Item>
                    )}
                    {rfi.dateAnswered && (
                      <Descriptions.Item label="Date Answered">
                        {formatProjectDate(rfi.dateAnswered)}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </div>

                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <p className={`mb-2 ${layout.drawerHeading}`}>Description</p>
                  <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                    {rfi.description?.trim() ? rfi.description : '-'}
                  </p>
                </div>
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
                          className="rounded-lg border border-[var(--color-border-tertiary)] bg-white p-3 shadow-sm"
                        >
                          <div className="mb-2 flex items-start gap-2">
                            <Avatar
                              size={28}
                              style={{
                                backgroundColor: responseAvatarColor(
                                  item.respondedBy,
                                  rfi.assignedTo,
                                  rfi.raisedBy,
                                ),
                              }}
                            >
                              {initialsFromName(displayName)}
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className={layout.drawerHeading}>
                                  {displayName}
                                </span>
                                <span className={layout.drawerMetaLabel}>
                                  {dayjs(item.respondedAt).fromNow()} ·{' '}
                                  {formatProjectDate(item.respondedAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p
                            className={`whitespace-pre-wrap ${layout.drawerMutedText}`}
                          >
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
                      loading={linkRfiCr.isPending}
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
                  <p className={layout.drawerMutedText}>
                    No change requests linked yet.
                  </p>
                )}
              </div>
            ),
          },
          {
            key: 'files',
            label: 'Files',
            children: (
              <DocumentAttachmentPanel
                folderId={rfi.attachmentFolderId ?? undefined}
                readOnly={rfi.status === 'CLOSED'}
                title="RFI files"
                description="Attachments and supporting documents for this RFI."
              />
            ),
          },
        ]}
      />

      {/* Sticky bottom workflow bar */}
      {showLifecycleActions && (
        <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
          <div className="flex flex-col gap-2">
            {canClose && (
              <Button
                type="primary"
                block
                loading={closeRfi.isPending}
                onClick={() => void handleClose()}
              >
                Close RFI
              </Button>
            )}
            {canReopen && (
              <Button
                block
                loading={reopenRfi.isPending}
                onClick={() =>
                  Modal.confirm({
                    title: 'Reopen this RFI?',
                    okText: 'Reopen',
                    onOk: () => handleReopen(),
                  })
                }
              >
                Reopen RFI
              </Button>
            )}
          </div>
        </div>
      )}

      <Modal
        title="Add Response"
        open={responseModalOpen}
        width={520}
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
          onFinish={(values: ResponseFormValues) =>
            void handleAddResponse(values)
          }
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

      <CreateChangeRequestDrawer
        open={createCrOpen}
        projectId={projectId}
        initialLinkedDesignPackageId={rfi.linkedDesignPackageId ?? undefined}
        onClose={() => setCreateCrOpen(false)}
        onCreated={(created) => void handleCrCreated(created)}
      />
    </div>
  );
}
