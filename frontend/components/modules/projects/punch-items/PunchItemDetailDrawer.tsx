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
  Spin,
  Tabs,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PunchItemSeverity,
  PunchItemStatus,
} from '@/lib/api/project-management.types';
import { PUNCH_ITEM_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useDeletePunchItem,
  usePunchItem,
  useUpdatePunchItem,
} from '@/lib/query/punch-items';
import { antDrawerBodyStylesMd, layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatPunchItemStatus,
  isOverdue,
  punchItemSeverityVariant,
  punchItemStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const SEVERITY_OPTIONS: { value: PunchItemSeverity; label: string }[] = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface PunchItemEditValues {
  description: string;
  roomOrArea?: string;
  tradeResponsible?: string;
  severity: PunchItemSeverity;
  assignedTo?: string;
  dueDate?: Dayjs;
}

export default function PunchItemDetailDrawer({
  projectId,
  punchItemId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  punchItemId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [form] = Form.useForm<PunchItemEditValues>();
  const open = Boolean(punchItemId);
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();

  const itemQuery = usePunchItem(projectId, punchItemId ?? '', open);
  const updateItem = useUpdatePunchItem();
  const deleteItem = useDeletePunchItem();

  const item = itemQuery.data;
  const isEditable =
    item?.status === 'RAISED' || item?.status === 'ASSIGNED';

  useEffect(() => {
    if (item) {
      form.setFieldsValue({
        description: item.description,
        roomOrArea: item.roomOrArea ?? undefined,
        tradeResponsible: item.tradeResponsible ?? undefined,
        severity: item.severity,
        assignedTo: item.assignedTo ?? undefined,
        dueDate: item.dueDate ? dayjs(item.dueDate) : undefined,
      });
    }
  }, [item, form]);

  async function handleStatusChange(status: PunchItemStatus): Promise<void> {
    if (!punchItemId) return;
    try {
      await updateItem.mutateAsync({
        projectId,
        punchItemId,
        body: { status },
      });
      messageApi.success('Status updated');
      onUpdated();
      void itemQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update status', messageApi);
    }
  }

  async function handleSave(values: PunchItemEditValues): Promise<void> {
    if (!punchItemId || !isEditable) return;
    try {
      await updateItem.mutateAsync({
        projectId,
        punchItemId,
        body: {
          description: values.description.trim(),
          roomOrArea: values.roomOrArea?.trim() || undefined,
          tradeResponsible: values.tradeResponsible?.trim() || undefined,
          severity: values.severity,
          assignedTo: values.assignedTo,
          dueDate: values.dueDate?.format('YYYY-MM-DD'),
        },
      });
      messageApi.success('Punch item updated');
      onUpdated();
      void itemQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update punch item', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!punchItemId) return;
    try {
      await deleteItem.mutateAsync({ projectId, punchItemId });
      messageApi.success('Punch item deleted');
      setDeleteOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to delete punch item', messageApi);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={
          item ? `${item.punchNumber} — ${item.description.slice(0, 40)}` : 'Punch item'
        }
        size="large"
        className="erp-responsive-drawer"
        styles={antDrawerBodyStylesMd}
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
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        )}
        {itemQuery.isError && (
          <p className="text-sm text-slate-500">
            {itemQuery.error instanceof ApiRequestError
              ? itemQuery.error.message
              : 'Unable to load punch item.'}
          </p>
        )}
        {item && (
          <div className={layout.drawerStack}>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-900">
                    {item.roomOrArea ? `Area: ${item.roomOrArea}` : 'No area specified'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Raised by {resolveUserName(item.raisedBy)}
                    {item.assignedTo
                      ? ` · Assigned to ${resolveUserName(item.assignedTo)}`
                      : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Due {formatProjectDate(item.dueDate)}
                    {isOverdue(item.dueDate) && item.status !== 'CLOSED' && (
                      <span className="ml-2 text-red-600">Overdue</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge
                    label={item.severity}
                    variant={punchItemSeverityVariant(item.severity)}
                  />
                  <StatusBadge
                    label={formatPunchItemStatus(item.status)}
                    variant={punchItemStatusVariant(item.status)}
                  />
                  <Select
                    className="w-full min-w-[160px]"
                    value={item.status}
                    onChange={(v: PunchItemStatus) => void handleStatusChange(v)}
                    options={PUNCH_ITEM_WORKFLOW.map((s) => ({
                      value: s.key,
                      label: s.label,
                    }))}
                  />
                </div>
              </div>
            </div>

            <WorkflowStepper
              steps={PUNCH_ITEM_WORKFLOW}
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
                    <Form<PunchItemEditValues>
                      form={form}
                      layout="vertical"
                      className="erp-drawer-form"
                      disabled={!isEditable}
                      onFinish={(values: PunchItemEditValues) =>
                        void handleSave(values)
                      }
                    >
                      <Form.Item
                        name="description"
                        label="Description"
                        rules={[{ required: true }]}
                      >
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="roomOrArea" label="Room / area">
                          <Input />
                        </Form.Item>
                        <Form.Item name="tradeResponsible" label="Trade">
                          <Input placeholder="e.g. Electrical" />
                        </Form.Item>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item
                          name="severity"
                          label="Severity"
                          rules={[{ required: true }]}
                        >
                          <Select options={SEVERITY_OPTIONS} />
                        </Form.Item>
                        <Form.Item name="assignedTo" label="Assigned to">
                          <UserSelect allowClear />
                        </Form.Item>
                      </div>
                      <Form.Item name="dueDate" label="Due date">
                        <DatePicker className="w-full" />
                      </Form.Item>
                      {!isEditable && (
                        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                          <p>Corrected: {formatProjectDate(item.correctedAt)}</p>
                          <p>Verified: {formatProjectDate(item.verifiedAt)}</p>
                        </div>
                      )}
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
                      title="Defect photos"
                      description="Before/after photos and drawing references for this punch item."
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
        title="Delete punch item?"
        description="This will remove the item from the punch list."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteItem.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
