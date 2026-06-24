// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  Select,
  Tabs,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CorrespondenceStatus,
  CorrespondenceType,
} from '@/lib/api/project-management.types';
import { CORRESPONDENCE_WORKFLOW } from '@/lib/api/workflow';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCorrespondenceItem,
  useDeleteCorrespondence,
  useUpdateCorrespondence,
} from '@/lib/query/correspondence';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  correspondenceStatusVariant,
  formatCorrespondenceStatus,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const TYPE_OPTIONS: { value: CorrespondenceType; label: string }[] = [
  { value: 'LETTER', label: 'Letter' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'INSTRUCTION', label: 'Instruction' },
  { value: 'MEMO', label: 'Memo' },
];

interface CorrespondenceEditValues {
  correspondenceType: CorrespondenceType;
  subject: string;
  senderName: string;
  recipientName: string;
  correspondenceDate: Dayjs;
  referenceNumber?: string;
}

export default function CorrespondenceDetailDrawer({
  projectId,
  correspondenceId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  correspondenceId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [form] = Form.useForm<CorrespondenceEditValues>();
  const open = Boolean(correspondenceId);
  const messageApi = useAppMessage();

  const itemQuery = useCorrespondenceItem(projectId, correspondenceId ?? '', open);
  const updateItem = useUpdateCorrespondence();
  const deleteItem = useDeleteCorrespondence();

  const item = itemQuery.data;
  const isEditable = item?.status === 'DRAFT';

  useEffect(() => {
    if (item) {
      form.setFieldsValue({
        correspondenceType: item.correspondenceType,
        subject: item.subject,
        senderName: item.senderName,
        recipientName: item.recipientName,
        correspondenceDate: dayjs(item.correspondenceDate),
        referenceNumber: item.referenceNumber,
      });
    }
  }, [item, form]);

  async function handleStatusChange(status: CorrespondenceStatus): Promise<void> {
    if (!correspondenceId) return;
    try {
      await updateItem.mutateAsync({
        projectId,
        correspondenceId,
        body: { status },
      });
      messageApi.success('Status updated');
      onUpdated();
      void itemQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update status', messageApi);
    }
  }

  async function handleSave(values: CorrespondenceEditValues): Promise<void> {
    if (!correspondenceId || !isEditable) return;
    try {
      await updateItem.mutateAsync({
        projectId,
        correspondenceId,
        body: {
          correspondenceType: values.correspondenceType,
          subject: values.subject.trim(),
          senderName: values.senderName.trim(),
          recipientName: values.recipientName.trim(),
          correspondenceDate: values.correspondenceDate.format('YYYY-MM-DD'),
          referenceNumber: values.referenceNumber?.trim() || undefined,
        },
      });
      messageApi.success('Correspondence updated');
      onUpdated();
      void itemQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update correspondence', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!correspondenceId) return;
    try {
      await deleteItem.mutateAsync({ projectId, correspondenceId });
      messageApi.success('Correspondence deleted');
      setDeleteOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to delete correspondence', messageApi);
    }
  }

  return (
    <>
      <Drawer
        {...wideDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={
          item
            ? `${item.referenceNumber} - ${item.subject}`
            : 'Correspondence'
        }
        destroyOnHidden
        extra={
          item && isEditable ? (
            <Button danger onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : undefined
        }
      >
        {itemQuery.isLoading && (
          <div className="flex flex-col gap-3">
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-32 w-full rounded" />
          </div>
        )}
        {itemQuery.isError && (
          <p className={layout.drawerMutedText}>
            {itemQuery.error instanceof ApiRequestError
              ? itemQuery.error.message
              : 'Unable to load correspondence.'}
          </p>
        )}
        {item && (
          <div className={layout.drawerStack}>
            <div className={layout.drawerSurface}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={layout.drawerMetaLabel}>
                    {item.correspondenceType.replace(/_/g, ' ')}
                  </p>
                  <p className={`mt-1 ${layout.drawerHeading}`}>
                    {formatProjectDate(item.correspondenceDate)}
                  </p>
                  <p className={`mt-1 ${layout.drawerMutedText}`}>
                    {item.senderName} → {item.recipientName}
                  </p>
                </div>
                <div className="w-full max-w-xs">
                  <StatusBadge
                    label={formatCorrespondenceStatus(item.status)}
                    variant={correspondenceStatusVariant(item.status)}
                  />
                  <Select
                    className="mt-2 w-full"
                    value={item.status}
                    onChange={(v: CorrespondenceStatus) =>
                      void handleStatusChange(v)
                    }
                    options={CORRESPONDENCE_WORKFLOW.map((s) => ({
                      value: s.key,
                      label: s.label,
                    }))}
                  />
                </div>
              </div>
            </div>

            <WorkflowStepper
              className="erp-drawer-workflow"
              steps={CORRESPONDENCE_WORKFLOW}
              currentStatus={item.status}
            />

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              destroyOnHidden
              items={[
                {
                  key: 'details',
                  label: 'Details',
                  children: (
                    <Form<CorrespondenceEditValues>
                      form={form}
                      layout="vertical"
                      className="erp-drawer-form"
                      disabled={!isEditable}
                      onFinish={(values: CorrespondenceEditValues) =>
                        void handleSave(values)
                      }
                    >
                      <Form.Item
                        name="correspondenceType"
                        label="Type"
                        rules={[{ required: true }]}
                      >
                        <Select options={TYPE_OPTIONS} />
                      </Form.Item>
                      <Form.Item
                        name="referenceNumber"
                        label="Reference number"
                      >
                        <Input disabled />
                      </Form.Item>
                      <Form.Item
                        name="subject"
                        label="Subject"
                        rules={[{ required: true }]}
                      >
                        <Input />
                      </Form.Item>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item
                          name="senderName"
                          label="Sender"
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name="recipientName"
                          label="Recipient"
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                      </div>
                      <Form.Item
                        name="correspondenceDate"
                        label="Date"
                        rules={[{ required: true }]}
                      >
                        <DatePicker className="w-full" />
                      </Form.Item>
                      {isEditable && (
                        <div className="flex justify-end">
                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={updateItem.isPending}
                          >
                            Save changes
                          </Button>
                        </div>
                      )}
                    </Form>
                  ),
                },
                {
                  key: 'attachments',
                  label: 'Attachments',
                  children: (
                    <DocumentAttachmentPanel
                      folderId={item.attachmentFolderId ?? undefined}
                      readOnly={!isEditable}
                      title="Correspondence files"
                      description="Letters, scans, and supporting documents."
                    />
                  ),
                },
              ]}
            />
            <Divider className="!my-0" />
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete correspondence?"
        description="This will permanently remove this record and its attachments folder link."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteItem.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
