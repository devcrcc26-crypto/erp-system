'use client';

import { useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Form, Input, Modal, Select, Timeline } from 'antd';
import dayjs from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge, { type StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type { RiskDetail, RiskStatus } from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcCapabilities } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import { useDeleteRisk, useRisk, useUpdateRisk } from '@/lib/query/risks';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  RISK_IMPACT_OPTIONS,
  RISK_LIKELIHOOD_OPTIONS,
  formatRiskCategory,
  formatRiskImpactLevel,
  formatRiskLikelihood,
  formatRiskStatus,
  riskScoreVariant,
  riskStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type StatusActionKey = 'accept' | 'close' | 'reopen';

const ACTION_CONFIG: Record<
  StatusActionKey,
  { title: string; description: string; confirmLabel: string; targetStatus: RiskStatus }
> = {
  accept: {
    title: 'Accept risk',
    description: 'Accept this risk without mitigation?',
    confirmLabel: 'Accept',
    targetStatus: 'ACCEPTED',
  },
  close: {
    title: 'Close risk',
    description:
      'Close this risk? This means the mitigation is complete and the risk is no longer active.',
    confirmLabel: 'Close',
    targetStatus: 'CLOSED',
  },
  reopen: {
    title: 'Reopen risk',
    description: 'Reopen this risk and return it to Open status?',
    confirmLabel: 'Reopen',
    targetStatus: 'OPEN',
  },
};

function RiskMetricCard({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: string;
  variant?: StatusBadgeVariant;
}): React.ReactNode {
  return (
    <div className={`${layout.drawerSurface} flex flex-col items-center gap-2 py-3`}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <StatusBadge label={value} variant={variant} />
    </div>
  );
}

function StatusActionModal({
  open,
  action,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  action: StatusActionKey | null;
  loading: boolean;
  onConfirm: (notes: string) => void;
  onClose: () => void;
}): React.ReactNode {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setNotes('');
    }
  }, [open]);

  if (!action) {
    return null;
  }
  const config = ACTION_CONFIG[action];

  return (
    <ConfirmDialog
      open={open}
      title={config.title}
      description={config.description}
      confirmLabel={config.confirmLabel}
      confirmLoading={loading}
      onConfirm={() => onConfirm(notes)}
      onCancel={onClose}
    >
      <Input.TextArea
        rows={3}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="!mt-3"
      />
    </ConfirmDialog>
  );
}

interface MitigationFormValues {
  mitigationPlan?: string;
}

function MitigationEditModal({
  open,
  projectId,
  risk,
  onClose,
  onUpdated,
}: {
  open: boolean;
  projectId: string;
  risk: RiskDetail | undefined;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<MitigationFormValues>();
  const updateRisk = useUpdateRisk();
  const messageApi = useAppMessage();

  useEffect(() => {
    if (open && risk) {
      form.setFieldsValue({ mitigationPlan: risk.mitigationPlan ?? undefined });
    }
  }, [open, risk, form]);

  async function handleSave(values: MitigationFormValues): Promise<void> {
    if (!risk) return;
    try {
      await updateRisk.mutateAsync({
        projectId,
        riskId: risk.id,
        body: { mitigationPlan: values.mitigationPlan?.trim() || undefined },
      });
      messageApi.success('Mitigation strategy updated');
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to update mitigation strategy', messageApi);
    }
  }

  return (
    <Modal title="Edit mitigation strategy" open={open} onCancel={onClose} destroyOnHidden footer={null}>
      <Form<MitigationFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: MitigationFormValues) => void handleSave(values)}
      >
        <Form.Item name="mitigationPlan" label="Mitigation strategy">
          <Input.TextArea rows={4} placeholder="Describe the planned mitigation for this risk" />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={updateRisk.isPending}>
            Save
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

interface ResidualFormValues {
  residualLikelihood: number;
  residualImpact: number;
  reviewNotes?: string;
}

function ResidualAssessmentModal({
  open,
  projectId,
  risk,
  onClose,
  onUpdated,
}: {
  open: boolean;
  projectId: string;
  risk: RiskDetail | undefined;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<ResidualFormValues>();
  const updateRisk = useUpdateRisk();
  const messageApi = useAppMessage();
  const likelihood = Form.useWatch('residualLikelihood', form);
  const impact = Form.useWatch('residualImpact', form);
  const previewScore = likelihood && impact ? likelihood * impact : null;

  useEffect(() => {
    if (open && risk) {
      form.setFieldsValue({
        residualLikelihood: risk.residualLikelihood ?? undefined,
        residualImpact: risk.residualImpact ?? undefined,
        reviewNotes: undefined,
      });
    }
  }, [open, risk, form]);

  async function handleSave(values: ResidualFormValues): Promise<void> {
    if (!risk) return;
    try {
      await updateRisk.mutateAsync({
        projectId,
        riskId: risk.id,
        body: {
          residualLikelihood: values.residualLikelihood,
          residualImpact: values.residualImpact,
          reviewNotes: values.reviewNotes?.trim() || undefined,
        },
      });
      messageApi.success('Residual risk assessed');
      onUpdated();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to save residual assessment', messageApi);
    }
  }

  return (
    <Modal title="Assess residual risk" open={open} onCancel={onClose} destroyOnHidden footer={null}>
      <Form<ResidualFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: ResidualFormValues) => void handleSave(values)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item
            name="residualLikelihood"
            label="Residual likelihood"
            rules={[{ required: true }]}
          >
            <Select options={RISK_LIKELIHOOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="residualImpact" label="Residual impact" rules={[{ required: true }]}>
            <Select options={RISK_IMPACT_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item label="Residual score">
          <div className="flex h-8 items-center">
            {previewScore ? (
              <StatusBadge label={String(previewScore)} variant={riskScoreVariant(previewScore)} />
            ) : (
              <span className={layout.drawerMutedText}>Select likelihood and impact</span>
            )}
          </div>
        </Form.Item>
        <Form.Item name="reviewNotes" label="Review notes">
          <Input.TextArea rows={3} />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={updateRisk.isPending}>
            Save
          </Button>
        </div>
      </Form>
    </Modal>
  );
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
  const [statusAction, setStatusAction] = useState<StatusActionKey | null>(null);
  const [mitigationOpen, setMitigationOpen] = useState(false);
  const [residualOpen, setResidualOpen] = useState(false);
  const open = Boolean(riskId);
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const epc = useEpcCapabilities();

  const riskQuery = useRisk(projectId, riskId ?? '', open);
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  const risk = riskQuery.data;
  const canEdit = Boolean(risk) && (epc.navFullAccess || risk!.ownerId === currentUserId);
  const showResidualSection = risk?.status === 'MITIGATED' || risk?.status === 'CLOSED';
  const hasResidualAssessment = risk?.residualScore != null;
  const reductionPct =
    hasResidualAssessment && risk && risk.riskScore > 0
      ? Math.round((1 - (risk.residualScore ?? 0) / risk.riskScore) * 100)
      : null;

  async function handleStatusAction(action: StatusActionKey, notes: string): Promise<void> {
    if (!riskId) return;
    try {
      await updateRisk.mutateAsync({
        projectId,
        riskId,
        body: {
          status: ACTION_CONFIG[action].targetStatus,
          reviewNotes: notes.trim() || undefined,
        },
      });
      messageApi.success(`Risk ${formatRiskStatus(ACTION_CONFIG[action].targetStatus).toLowerCase()}`);
      setStatusAction(null);
      onUpdated();
    } catch (error) {
      notifyApiError(error, 'Failed to update risk status', messageApi);
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

  function renderActions(): React.ReactNode {
    if (!risk || !canEdit) return null;
    switch (risk.status) {
      case 'OPEN':
        return (
          <Button block onClick={() => setStatusAction('accept')}>
            Accept risk
          </Button>
        );
      case 'MITIGATED':
        return (
          <Button block onClick={() => setStatusAction('close')}>
            Close risk
          </Button>
        );
      case 'ACCEPTED':
        return (
          <div className="flex gap-2">
            <Button block onClick={() => setStatusAction('close')}>
              Close risk
            </Button>
            <Button block onClick={() => setStatusAction('reopen')}>
              Reopen
            </Button>
          </div>
        );
      case 'CLOSED':
        return (
          <Button block onClick={() => setStatusAction('reopen')}>
            Reopen
          </Button>
        );
      case 'MONITORING':
        return (
          <div className="flex gap-2">
            <Button block onClick={() => setStatusAction('reopen')}>
              Move to open
            </Button>
            <Button block onClick={() => setStatusAction('close')}>
              Close risk
            </Button>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <Drawer
        {...wideDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={
          risk ? (
            <span className="flex flex-wrap items-center gap-2">
              {risk.riskIdCode} — {risk.title}
              <StatusBadge label={formatRiskStatus(risk.status)} variant={riskStatusVariant(risk.status)} />
            </span>
          ) : (
            'Risk'
          )
        }
        destroyOnHidden
        extra={
          risk && canEdit ? (
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
            <Descriptions className={layout.drawerDescriptionsClass} column={1} size="small" bordered>
              <Descriptions.Item label="Category">
                {formatRiskCategory(risk.category)}
              </Descriptions.Item>
              <Descriptions.Item label="Owner">
                {resolveUserDisplay(risk.ownerId, risk.ownerName)}
              </Descriptions.Item>
              <Descriptions.Item label="Review date">
                {formatProjectDate(risk.reviewDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Created by">
                {resolveUserDisplay(risk.createdBy, risk.createdByName)}
              </Descriptions.Item>
              <Descriptions.Item label="Created on">
                {formatProjectDate(risk.createdAt)}
              </Descriptions.Item>
            </Descriptions>

            <section className={layout.drawerSection}>
              <h3 className={`${layout.drawerHeading} mb-3`}>Inherent risk</h3>
              <div className="grid grid-cols-3 gap-3">
                <RiskMetricCard label="Likelihood" value={formatRiskLikelihood(risk.probability)} />
                <RiskMetricCard label="Impact" value={formatRiskImpactLevel(risk.impact)} />
                <RiskMetricCard
                  label="Score"
                  value={String(risk.riskScore)}
                  variant={riskScoreVariant(risk.riskScore)}
                />
              </div>
            </section>

            <section className={layout.drawerSection}>
              <h3 className={`${layout.drawerHeading} mb-2`}>Description</h3>
              <div className={layout.drawerSurface}>
                <p className="whitespace-pre-wrap">
                  {risk.description || 'No description provided'}
                </p>
              </div>
            </section>

            <section className={layout.drawerSection}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className={layout.drawerHeading}>Mitigation strategy</h3>
                {canEdit && (
                  <Button size="small" onClick={() => setMitigationOpen(true)}>
                    Edit
                  </Button>
                )}
              </div>
              <div className={layout.drawerSurface}>
                {risk.mitigationPlan ? (
                  <p className="whitespace-pre-wrap">{risk.mitigationPlan}</p>
                ) : (
                  <p className={layout.drawerMutedText}>No mitigation strategy defined</p>
                )}
              </div>
            </section>

            {showResidualSection && (
              <section className={layout.drawerSection}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={layout.drawerHeading}>Residual risk</h3>
                  {canEdit && hasResidualAssessment && (
                    <Button size="small" onClick={() => setResidualOpen(true)}>
                      Edit
                    </Button>
                  )}
                </div>
                {hasResidualAssessment ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <RiskMetricCard
                        label="Residual likelihood"
                        value={formatRiskLikelihood(risk.residualLikelihood!)}
                      />
                      <RiskMetricCard
                        label="Residual impact"
                        value={formatRiskImpactLevel(risk.residualImpact!)}
                      />
                      <RiskMetricCard
                        label="Residual score"
                        value={String(risk.residualScore)}
                        variant={riskScoreVariant(risk.residualScore!)}
                      />
                    </div>
                    <p className={`mt-3 ${layout.drawerMutedText}`}>
                      Inherent: {risk.riskScore} → Residual: {risk.residualScore}
                      {reductionPct !== null && reductionPct !== 0 && (
                        <>
                          {' '}
                          ({reductionPct > 0 ? `${reductionPct}% reduction` : `${Math.abs(reductionPct)}% increase`})
                        </>
                      )}
                    </p>
                  </>
                ) : canEdit ? (
                  <Button onClick={() => setResidualOpen(true)}>Assess residual risk</Button>
                ) : (
                  <p className={layout.drawerMutedText}>No residual assessment recorded</p>
                )}
              </section>
            )}

            <section className={layout.drawerSection}>
              <h3 className={`${layout.drawerHeading} mb-3`}>Review history</h3>
              {risk.reviews.length === 0 ? (
                <p className={layout.drawerMutedText}>No reviews yet</p>
              ) : (
                <Timeline
                  items={risk.reviews.map((review) => ({
                    children: (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-slate-700">
                          {dayjs(review.reviewedAt).format('MMM D, YYYY HH:mm')} —{' '}
                          {resolveUserDisplay(review.reviewedBy, review.reviewedByName)}
                        </span>
                        {review.previousStatus !== review.newStatus && review.newStatus && (
                          <span className="text-xs text-slate-500">
                            Status:{' '}
                            {review.previousStatus
                              ? formatRiskStatus(review.previousStatus as RiskStatus)
                              : '—'}{' '}
                            → {formatRiskStatus(review.newStatus as RiskStatus)}
                          </span>
                        )}
                        {review.previousScore !== review.newScore && (
                          <span className="text-xs text-slate-500">
                            Score: {review.previousScore ?? '—'} → {review.newScore ?? '—'}
                          </span>
                        )}
                        {review.previousResidualScore !== review.newResidualScore && (
                          <span className="text-xs text-slate-500">
                            Residual score: {review.previousResidualScore ?? '—'} →{' '}
                            {review.newResidualScore ?? '—'}
                          </span>
                        )}
                        {review.notes && (
                          <span className="text-xs text-slate-600">{review.notes}</span>
                        )}
                      </div>
                    ),
                  }))}
                />
              )}
            </section>

            <section className={layout.drawerSection}>
              <DocumentAttachmentPanel
                folderId={risk.attachmentFolderId ?? undefined}
                readOnly={!canEdit}
                title="Attachments"
                description="Assessments, photos, and mitigation evidence."
              />
            </section>

            {renderActions() && (
              <section className={layout.drawerSection}>{renderActions()}</section>
            )}
          </div>
        )}
      </Drawer>

      <StatusActionModal
        open={Boolean(statusAction)}
        action={statusAction}
        loading={updateRisk.isPending}
        onConfirm={(notes) => statusAction && void handleStatusAction(statusAction, notes)}
        onClose={() => setStatusAction(null)}
      />

      <MitigationEditModal
        open={mitigationOpen}
        projectId={projectId}
        risk={risk}
        onClose={() => setMitigationOpen(false)}
        onUpdated={onUpdated}
      />

      <ResidualAssessmentModal
        open={residualOpen}
        projectId={projectId}
        risk={risk}
        onClose={() => setResidualOpen(false)}
        onUpdated={onUpdated}
      />

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
