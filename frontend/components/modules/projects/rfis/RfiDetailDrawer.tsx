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
import { layout, standardDetailDrawerProps } from '@/lib/theme/layout';
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
  const router = useRouter();
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
    rfi?.status === 'ANSWERED' &&
    (isRaisedByMe || pm.projects.canView);
  const canReopen =
    rfi?.status === 'CLOSED' &&
    (isRaisedByMe || pm.projects.canView);
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
      {...standardDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={
        rfi ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-semibold">
              {rfi.rfiNumber}
            </span>
            <StatusBadge
              label={formatRfiStatus(rfi.status)}
              variant={rfiStatusVariant(rfi.status)}
            />
          </div>
        ) : (
          'RFI'
        )
      }
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
          <div className="mb-2 flex justify-end">
            <Button
              type="link"
              size="small"
              onClick={() => {
                onClose();
                router.push(`/projects/${projectId}/rfis/${rfi.id}`);
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
              <Descriptions.Item label="Raised By">
                {rfi.raisedByName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Assigned To">
                {rfi.assignedToName ?? '-'}
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
              <Descriptions.Item label="Source">
                {formatRfiSource(rfi.rfiSource) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Priority">
                <StatusBadge
                  label={rfi.priority}
                  variant={rfiPriorityVariant(rfi.priority)}
                />
              </Descriptions.Item>
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
          </section>

          <section className={layout.drawerSection}>
            <p className={`mb-1 ${layout.drawerHeading}`}>Description</p>
            <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
              {rfi.description?.trim() ? rfi.description : '-'}
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
          </section>

          <section className={layout.drawerSection}>
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
              <p className={layout.drawerMutedText}>
                No change requests linked yet.
              </p>
            )}
          </section>

          {showLifecycleActions && (
            <section className={layout.drawerSection}>
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
            </section>
          )}
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
