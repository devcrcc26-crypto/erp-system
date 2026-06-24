// UI polish pass — styles only, no logic changes

'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
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
  RiskCategory,
  RiskStatus,
} from '@/lib/api/project-management.types';
import { RISK_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useDeleteRisk,
  useRisk,
  useUpdateRisk,
} from '@/lib/query/risks';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatRiskCategory,
  formatRiskStatus,
  riskScoreVariant,
  riskStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const CATEGORY_OPTIONS: { value: RiskCategory; label: string }[] = [
  { value: 'COST', label: 'Cost' },
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'ENVIRONMENTAL', label: 'Environmental' },
  { value: 'CONTRACTUAL', label: 'Contractual' },
];

interface RiskEditValues {
  riskIdCode: string;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  ownerId: string;
  mitigationPlan?: string;
  contingencyPlan?: string;
  reviewDate?: Dayjs;
}

export default function RiskDetailDrawer({
  projectId,
  riskId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  riskId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [form] = Form.useForm<RiskEditValues>();
  const open = Boolean(riskId);
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();

  const riskQuery = useRisk(projectId, riskId ?? '', open);
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  const risk = riskQuery.data;
  const isEditable = risk?.status === 'OPEN' || risk?.status === 'MONITORING';
  const probability = Form.useWatch('probability', form) ?? risk?.probability ?? 1;
  const impact = Form.useWatch('impact', form) ?? risk?.impact ?? 1;
  const liveScore = probability * impact;

  useEffect(() => {
    if (risk) {
      form.setFieldsValue({
        riskIdCode: risk.riskIdCode,
        title: risk.title,
        description: risk.description ?? undefined,
        category: risk.category,
        probability: risk.probability,
        impact: risk.impact,
        ownerId: risk.ownerId,
        mitigationPlan: risk.mitigationPlan ?? undefined,
        contingencyPlan: risk.contingencyPlan ?? undefined,
        reviewDate: risk.reviewDate ? dayjs(risk.reviewDate) : undefined,
      });
    }
  }, [risk, form]);

  async function handleStatusChange(status: RiskStatus): Promise<void> {
    if (!riskId) return;
    try {
      await updateRisk.mutateAsync({ projectId, riskId, body: { status } });
      messageApi.success('Risk status updated');
      onUpdated();
      void riskQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update status', messageApi);
    }
  }

  async function handleSave(values: RiskEditValues): Promise<void> {
    if (!riskId || !isEditable) return;
    try {
      await updateRisk.mutateAsync({
        projectId,
        riskId,
        body: {
          riskIdCode: values.riskIdCode.trim(),
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          category: values.category,
          probability: values.probability,
          impact: values.impact,
          ownerId: values.ownerId,
          mitigationPlan: values.mitigationPlan?.trim() || undefined,
          contingencyPlan: values.contingencyPlan?.trim() || undefined,
          reviewDate: values.reviewDate?.format('YYYY-MM-DD'),
        },
      });
      messageApi.success('Risk updated');
      onUpdated();
      void riskQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update risk', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!riskId) return;
    try {
      await deleteRisk.mutateAsync({ projectId, riskId });
      messageApi.success('Risk deleted');
      setDeleteOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to delete risk', messageApi);
    }
  }

  return (
    <>
      <Drawer
        {...wideDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={risk ? `${risk.riskIdCode} — ${risk.title}` : 'Risk'}
        destroyOnHidden
        extra={
          risk && isEditable ? (
            <Button danger onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : undefined
        }
      >
        {riskQuery.isLoading && (
          <div className="flex flex-col gap-3">
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-32 w-full rounded" />
          </div>
        )}
        {riskQuery.isError && (
          <p className={layout.drawerMutedText}>
            {riskQuery.error instanceof ApiRequestError
              ? riskQuery.error.message
              : 'Unable to load risk.'}
          </p>
        )}
        {risk && (
          <div className={layout.drawerStack}>
            <div className={layout.drawerSurface}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={layout.drawerMetaLabel}>
                    {formatRiskCategory(risk.category)}
                  </p>
                  <p className={`mt-1 ${layout.drawerMutedText}`}>
                    Owner: {resolveUserName(risk.ownerId)}
                  </p>
                  <p className={`mt-1 ${layout.drawerMutedText}`}>
                    Review: {formatProjectDate(risk.reviewDate)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge
                    label={`Score ${risk.riskScore}`}
                    variant={riskScoreVariant(risk.riskScore)}
                  />
                  <StatusBadge
                    label={formatRiskStatus(risk.status)}
                    variant={riskStatusVariant(risk.status)}
                  />
                  <Select
                    className="w-full min-w-[160px]"
                    value={risk.status}
                    onChange={(v: RiskStatus) => void handleStatusChange(v)}
                    options={RISK_WORKFLOW.map((s) => ({
                      value: s.key,
                      label: s.label,
                    }))}
                  />
                </div>
              </div>
            </div>

            <WorkflowStepper
              className="erp-drawer-workflow"
              steps={RISK_WORKFLOW}
              currentStatus={risk.status}
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
                    <Form<RiskEditValues>
                      form={form}
                      layout="vertical"
                      className="erp-drawer-form"
                      disabled={!isEditable}
                      onFinish={(values: RiskEditValues) =>
                        void handleSave(values)
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item
                          name="riskIdCode"
                          label="Risk ID"
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name="category"
                          label="Category"
                          rules={[{ required: true }]}
                        >
                          <Select options={CATEGORY_OPTIONS} />
                        </Form.Item>
                      </div>
                      <Form.Item
                        name="title"
                        label="Title"
                        rules={[{ required: true }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name="description" label="Description">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      <Form.Item
                        name="ownerId"
                        label="Owner"
                        rules={[{ required: true }]}
                      >
                        <UserSelect />
                      </Form.Item>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Form.Item
                          name="probability"
                          label="Probability (1–5)"
                          rules={[{ required: true }]}
                        >
                          <InputNumber className="!w-full" min={1} max={5} />
                        </Form.Item>
                        <Form.Item
                          name="impact"
                          label="Impact (1–5)"
                          rules={[{ required: true }]}
                        >
                          <InputNumber className="!w-full" min={1} max={5} />
                        </Form.Item>
                        <Form.Item label="Risk score">
                          <div className="flex h-8 items-center">
                            <StatusBadge
                              label={String(liveScore)}
                              variant={riskScoreVariant(liveScore)}
                            />
                          </div>
                        </Form.Item>
                      </div>
                      <Form.Item name="mitigationPlan" label="Mitigation plan">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      <Form.Item name="contingencyPlan" label="Contingency plan">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      <Form.Item name="reviewDate" label="Review date">
                        <DatePicker className="w-full" />
                      </Form.Item>
                      {isEditable && (
                        <div className="flex justify-end">
                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={updateRisk.isPending}
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
                      folderId={risk.attachmentFolderId ?? undefined}
                      readOnly={!isEditable}
                      title="Risk documents"
                      description="Supporting assessments, photos, and mitigation evidence."
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
        title="Delete risk?"
        description="This will remove the risk from the register."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteRisk.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
