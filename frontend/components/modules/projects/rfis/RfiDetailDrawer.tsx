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
import { ApiRequestError } from '@/lib/api/errors';
import { apiGet } from '@/lib/api/client';
import type { RfiSource } from '@/lib/api/project-management.types';
import type { ProjectChangeRequest } from '@/lib/api/project-management.types';
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
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';
import CreateChangeRequestDrawer from '@/components/modules/projects/change-requests/CreateChangeRequestDrawer';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';
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
  const [responseModalOpen, setResponseModalOpen] = useState(false);
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
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const rfi = rfiQuery.data;
  const responses = responsesQuery.data ?? [];

  const canRespond =
    rfi != null &&
    rfi.status !== 'CLOSED' &&
    (currentUserId === rfi.raisedBy ||
      currentUserId === rfi.assignedTo ||
      pm.projects.canView);
  const canClose =
    rfi?.status === 'ANSWERED' && currentUserId === rfi?.raisedBy;
  const canReopen =
    rfi?.status === 'CLOSED' &&
    (currentUserId === rfi?.raisedBy || pm.projects.canView);
  const showWaitingAlert =
    responses.length === 0 &&
    (rfi?.status === 'SUBMITTED' || rfi?.status === 'UNDER_REVIEW');
  const showRaiseCrButton =
    rfi?.status === 'ANSWERED' && !rfi?.linkedCrId;

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
      closeResponseModal();
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

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={rfi ? rfi.title : 'RFI detail'}
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
          {/* SECTION 1 — HEADER */}
          <section>
            <div className="mb-2 flex items-start justify-between gap-3">
              <span
                className="text-[15px] font-semibold leading-tight"
                style={{ color: tokens.colorTeal600 }}
              >
                {rfi.rfiNumber}
              </span>
              <StatusBadge
                label={formatRfiStatus(rfi.status)}
                variant={rfiStatusVariant(rfi.status)}
              />
            </div>
            <StatusBadge
              label={rfi.priority}
              variant={rfiPriorityVariant(rfi.priority)}
            />
          </section>

          {/* SECTION 2 — DETAILS */}
          <section className={layout.drawerSection}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailCell label="Raised by">
                {resolveUserDisplay(rfi.raisedBy, rfi.raisedByName)}
              </DetailCell>
              <DetailCell label="Assigned to">
                {resolveUserDisplay(rfi.assignedTo, rfi.assignedToName, '—')}
              </DetailCell>
              <DetailCell label="Date raised">
                {formatProjectDate(rfi.dateRaised)}
              </DetailCell>
              <DetailCell label="Due date">
                <span
                  style={
                    isOverdue(rfi.dueDate) && rfi.status !== 'CLOSED'
                      ? { color: tokens.colorRed600, fontWeight: 500 }
                      : undefined
                  }
                >
                  {formatProjectDate(rfi.dueDate)}
                </span>
              </DetailCell>
              <DetailCell label="Source">
                {rfi.rfiSource
                  ? (RFI_SOURCE_LABELS[rfi.rfiSource] ?? rfi.rfiSource)
                  : '—'}
              </DetailCell>
              <DetailCell label="Subtask">
                {rfi.linkedDesignPackage
                  ? `${rfi.linkedDesignPackage.fullCode} ${rfi.linkedDesignPackage.name}`
                  : '—'}
              </DetailCell>
              {rfi.sourceEntitySummary && (
                <>
                  <DetailCell label="RFI Source type">
                    {rfi.sourceEntitySummary.type.replace(/_/g, ' ')}
                  </DetailCell>
                  <DetailCell label="Source entity">
                    {rfi.sourceEntitySummary.label}
                  </DetailCell>
                </>
              )}
            </div>
          </section>

          {/* SECTION 3 — DESCRIPTION */}
          <section className={layout.drawerSection}>
            <p className={`mb-1 ${layout.drawerHeading}`}>Description</p>
            <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
              {rfi.description?.trim() ? rfi.description : '—'}
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
                        <Avatar
                          size={28}
                          style={{ backgroundColor: tokens.colorTeal400 }}
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
                type="primary"
                className="mt-3"
                onClick={() => setResponseModalOpen(true)}
              >
                Add Response
              </Button>
            )}
          </section>

          {/* SECTION 5 — LINKED CR */}
          {rfi.linkedCrId && (
            <section className={layout.drawerSection}>
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
                Linked Change Request:{' '}
                {rfi.linkedCrNumber ?? rfi.linkedCrId} →
              </Button>
            </section>
          )}

          {/* SECTION 6 — ACTIONS */}
          {(canClose || canReopen || showRaiseCrButton) && (
            <section className={layout.drawerSection}>
              <Space wrap>
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
                        okText: 'Reopen',
                        onOk: () => handleReopen(),
                      })
                    }
                    loading={reopenRfi.isPending}
                  >
                    Reopen
                  </Button>
                )}
                {showRaiseCrButton && (
                  <Button
                    onClick={() => setCreateCrOpen(true)}
                    loading={linkRfiCr.isPending}
                  >
                    Raise CR
                  </Button>
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
