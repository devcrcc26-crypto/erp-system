'use client';

import { useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import {
  useAddSessionAttachment,
  useSessionAttachments,
} from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useProjectDocuments } from '@/lib/query/documents';
import type { ReviewTier } from '@/lib/api/project-management.types';
import type { ReviewSessionAttachment } from '@/lib/api/project-management.types';
import { useAuthStore } from '@/stores/auth.store';
import {
  orderedRequiredTiers,
  resolveTierActorUserId,
  reviewTierLabel,
  REVIEW_TIER_ORDER,
} from '@/lib/utils/review-tier-display';
import { downloadDocument } from '@/lib/utils/document-download';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { formatProjectDate } from '@/lib/utils/project-display';

function AttachmentDownloadButton({
  documentId,
  fileName,
}: {
  documentId: string;
  fileName: string;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="link"
      size="small"
      className="!px-0"
      icon={<DownloadOutlined />}
      loading={loading}
      onClick={() => {
        setLoading(true);
        void downloadDocument(documentId, fileName)
          .catch((error: unknown) => {
            notifyApiError(error, 'Unable to download attachment', messageApi);
          })
          .finally(() => {
            setLoading(false);
          });
      }}
    >
      Download
    </Button>
  );
}

function TierAttachmentList({
  attachments,
}: {
  attachments: ReviewSessionAttachment[];
}): React.ReactNode {
  if (attachments.length === 0) {
    return (
      <p className="text-sm text-slate-500">No attachments from this tier.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">
                {attachment.document.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {attachment.attachedByUser.name} ·{' '}
                {formatProjectDate(attachment.attachedAt)}
              </p>
              {attachment.note ? (
                <p className="mt-2 text-xs text-slate-600">{attachment.note}</p>
              ) : null}
            </div>
            <Space size="small" wrap>
              {attachment.purpose ? (
                <StatusBadge label={attachment.purpose} variant="info" />
              ) : null}
              <AttachmentDownloadButton
                documentId={attachment.document.id}
                fileName={attachment.document.name}
              />
            </Space>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReviewSessionAttachmentsSection({
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  currentTier,
  requiredTiers,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string;
  currentTier: ReviewTier | string | null;
  requiredTiers: readonly ReviewTier[];
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm<{
    documentId: string;
    purpose?: string;
    note?: string;
  }>();

  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId);
  const attachmentsQuery = useSessionAttachments(
    projectId,
    taskDisciplineId,
    packageId,
    reviewSessionId,
  );
  const documentsQuery = useProjectDocuments(
    projectId,
    { page: 1, limit: 100, taskDisciplineId },
    addOpen,
  );
  const addAttachment = useAddSessionAttachment(
    projectId,
    taskDisciplineId,
    packageId,
    reviewSessionId,
  );

  const tierActorUserId = disciplineQuery.data
    ? resolveTierActorUserId(disciplineQuery.data, currentTier)
    : null;
  const canAddAttachment =
    Boolean(currentUserId) &&
    Boolean(currentTier) &&
    tierActorUserId === currentUserId;

  const attachmentsByTier = useMemo(() => {
    const map = new Map<ReviewTier, ReviewSessionAttachment[]>();
    for (const tier of orderedRequiredTiers(requiredTiers)) {
      map.set(tier, []);
    }
    for (const attachment of attachmentsQuery.data ?? []) {
      const tier = attachment.tier as ReviewTier;
      const existing = map.get(tier) ?? [];
      existing.push(attachment);
      map.set(tier, existing);
    }
    return map;
  }, [attachmentsQuery.data, requiredTiers]);

  const documentOptions = useMemo(
    () =>
      (documentsQuery.data?.data ?? []).map((doc) => ({
        value: doc.id,
        label: doc.name,
      })),
    [documentsQuery.data],
  );

  const visibleTiers = useMemo(() => {
    const tiers = new Set(orderedRequiredTiers(requiredTiers));
    for (const attachment of attachmentsQuery.data ?? []) {
      tiers.add(attachment.tier as ReviewTier);
    }
    return REVIEW_TIER_ORDER.filter((tier) => tiers.has(tier));
  }, [attachmentsQuery.data, requiredTiers]);

  return (
    <FormLayout
      title="Review Attachments"
      description="Files attached by reviewers at each governance tier."
      extra={
        canAddAttachment ? (
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddOpen(true)}
          >
            Add Attachment
          </Button>
        ) : undefined
      }
    >
      {attachmentsQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading attachments…</p>
      ) : (
        <div className="space-y-5">
          {visibleTiers.map((tier) => (
            <section key={tier}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {reviewTierLabel(tier)}
              </h4>
              <TierAttachmentList attachments={attachmentsByTier.get(tier) ?? []} />
            </section>
          ))}
        </div>
      )}

      <Modal
        title="Add review attachment"
        open={addOpen}
        onCancel={() => {
          setAddOpen(false);
          form.resetFields();
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              await addAttachment.mutateAsync({
                documentId: values.documentId,
                purpose: values.purpose?.trim() || undefined,
                note: values.note?.trim() || undefined,
              });
              messageApi.success('Attachment added');
              form.resetFields();
              setAddOpen(false);
              void attachmentsQuery.refetch();
            } catch (error) {
              notifyApiError(error, 'Failed to add attachment', messageApi);
            }
          }}
        >
          <Form.Item
            label="Document"
            name="documentId"
            rules={[{ required: true, message: 'Select a document' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select project document"
              options={documentOptions}
              loading={documentsQuery.isLoading}
            />
          </Form.Item>
          <Form.Item label="Purpose" name="purpose">
            <Input placeholder="e.g. Markup, Reference" />
          </Form.Item>
          <Form.Item label="Note" name="note">
            <Input.TextArea rows={2} placeholder="Optional note" />
          </Form.Item>
          <Space>
            <Button
              onClick={() => {
                setAddOpen(false);
                form.resetFields();
              }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={addAttachment.isPending}>
              Add attachment
            </Button>
          </Space>
        </Form>
      </Modal>
    </FormLayout>
  );
}
