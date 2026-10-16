'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Tabs,
  Timeline,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge, { type StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  RiskDetail,
  RiskMitigation,
  RiskStatus,
} from '@/lib/api/project-management.types';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAcceptRisk,
  useAddRiskMitigation,
  useCloseRisk,
  useDeleteRisk,
  useReopenRisk,
  useRisk,
} from '@/lib/query/risks';
import { layout } from '@/lib/theme/layout';
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

function residualScoreBackground(score: number): string {
  if (score >= 20) return 'rgba(220, 38, 38, 0.12)';
  if (score >= 10) return 'rgba(234, 88, 12, 0.12)';
  if (score >= 5) return 'rgba(202, 138, 4, 0.12)';
  return 'rgba(22, 163, 74, 0.12)';
}

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

function ScorePreview({
  likelihood,
  impact,
  inherentScore,
}: {
  likelihood?: number;
  impact?: number;
  inherentScore?: number;
}): React.ReactNode {
  if (!likelihood || !impact) {
    return (
      <div className="mb-3 rounded-lg border border-dashed p-3 text-center text-sm text-[var(--color-text-secondary)]">
        Select residual likelihood and impact to preview the score
      </div>
    );
  }

  const residualScore = likelihood * impact;
  const reductionPct =
    inherentScore && inherentScore > 0
      ? Math.round((1 - residualScore / inherentScore) * 100)
      : null;

  return (
    <div
      className="mb-3 rounded-lg border p-3"
      style={{ backgroundColor: residualScoreBackground(residualScore) }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
            Residual score preview
          </p>
          <p className="text-2xl font-bold">{residualScore}</p>
        </div>
        {inherentScore != null && (
          <p className="text-xs text-[var(--color-text-secondary)]">
            Inherent {inherentScore} → Residual {residualScore}
            {reductionPct !== null && reductionPct !== 0
              ? ` (${reductionPct > 0 ? `${reductionPct}% reduction` : `${Math.abs(reductionPct)}% increase`})`
              : ''}
          </p>
        )}
      </div>
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
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNotes('');
      setNotesError(null);
    }
  }, [open]);

  if (!action) {
    return null;
  }

  const copy: Record<
    StatusActionKey,
    { title: string; description: string; confirmLabel: string; notesRequired: boolean }
  > = {
    accept: {
      title: 'Accept Risk',
      description:
        'Accept this risk without mitigation? The project acknowledges this risk and will proceed without additional mitigation measures.',
      confirmLabel: 'Accept Risk',
      notesRequired: false,
    },
    close: {
      title: 'Close Risk',
      description:
        'Close this risk? This means the risk is no longer active - either the mitigation was verified or the condition no longer applies.',
      confirmLabel: 'Close Risk',
      notesRequired: false,
    },
    reopen: {
      title: 'Reopen Risk',
      description:
        'Reopen this risk? The status will return to Open and the risk will need to be reassessed.',
      confirmLabel: 'Reopen',
      notesRequired: true,
    },
  };

  const config = copy[action];

  return (
    <ConfirmDialog
      open={open}
      title={config.title}
      description={config.description}
      confirmLabel={config.confirmLabel}
      confirmLoading={loading}
      onConfirm={() => {
        if (config.notesRequired && !notes.trim()) {
          setNotesError('Notes are required when reopening a risk');
          return;
        }
        onConfirm(notes.trim());
      }}
      onCancel={onClose}
    >
      <Input.TextArea
        rows={3}
        placeholder={
          config.notesRequired ? 'Notes (required)' : 'Notes (optional)'
        }
        value={notes}
        status={notesError ? 'error' : undefined}
        onChange={(e) => {
          setNotes(e.target.value);
          if (notesError) setNotesError(null);
        }}
        className="!mt-3"
      />
      {notesError && (
        <p className="mt-1 text-xs text-red-600">{notesError}</p>
      )}
    </ConfirmDialog>
  );
}

interface MitigationFormValues {
  mitigationStrategy: string;
  residualLikelihood: number;
  residualImpact: number;
  notes?: string;
}

function AddMitigationModal({
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
  const addMitigation = useAddRiskMitigation();
  const messageApi = useAppMessage();
  const likelihood = Form.useWatch('residualLikelihood', form);
  const impact = Form.useWatch('residualImpact', form);

  useEffect(() => {
    if (open) {
      form.resetFields();
    }
  }, [open, form]);

  async function handleSave(): Promise<void> {
    if (!risk) return;
    try {
      const values = await form.validateFields();
      await addMitigation.mutateAsync({
        projectId,
        riskId: risk.id,
        body: {
          mitigationStrategy: values.mitigationStrategy.trim(),
          residualLikelihood: values.residualLikelihood,
          residualImpact: values.residualImpact,
          notes: values.notes?.trim() || undefined,
        },
      });
      messageApi.success('Mitigation attempt saved');
      onUpdated();
      onClose();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, 'Failed to save mitigation', messageApi);
    }
  }

  return (
    <Modal
      title="Add Mitigation Attempt"
      open={open}
      onCancel={onClose}
      onOk={() => void handleSave()}
      okText="Save"
      confirmLoading={addMitigation.isPending}
      destroyOnHidden
      width={560}
    >
      {open ? (
        <Form form={form} layout="vertical" className="erp-drawer-form">
          <Form.Item
            name="mitigationStrategy"
            label="Mitigation Strategy"
            rules={[
              {
                required: true,
                message: 'Describe what you will do to reduce this risk',
              },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Describe the mitigation measures being applied or planned..."
            />
          </Form.Item>

          <div className="flex gap-3">
            <Form.Item
              name="residualLikelihood"
              label="Residual Likelihood"
              rules={[{ required: true }]}
              className="flex-1"
            >
              <Select
                placeholder="After mitigation"
                options={RISK_LIKELIHOOD_OPTIONS}
              />
            </Form.Item>
            <Form.Item
              name="residualImpact"
              label="Residual Impact"
              rules={[{ required: true }]}
              className="flex-1"
            >
              <Select
                placeholder="After mitigation"
                options={RISK_IMPACT_OPTIONS}
              />
            </Form.Item>
          </div>

          <ScorePreview
            likelihood={likelihood}
            impact={impact}
            inherentScore={risk?.riskScore}
          />

          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea
              rows={2}
              placeholder="Additional context about this mitigation attempt"
            />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
}

function BestMitigationCard({
  best,
  inherentScore,
}: {
  best: RiskMitigation;
  inherentScore: number;
}): React.ReactNode {
  const reductionPct =
    inherentScore > 0
      ? Math.round((1 - best.residualScore / inherentScore) * 100)
      : null;

  return (
    <div className="mb-3 rounded-lg border-2 border-[var(--color-border-secondary)] bg-[var(--color-surface-secondary)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          Best Mitigation
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">
          Attempt {best.attemptNumber} - {formatProjectDate(best.assessedAt)}
        </span>
      </div>

      <p className="mb-3 whitespace-pre-wrap text-sm">{best.mitigationStrategy}</p>

      <div className="mb-2 grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
            Likelihood
          </p>
          <p className="text-sm font-medium">
            {formatRiskLikelihood(best.residualLikelihood)}
          </p>
        </div>
        <div className="rounded-lg border p-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
            Impact
          </p>
          <p className="text-sm font-medium">
            {formatRiskImpactLevel(best.residualImpact)}
          </p>
        </div>
        <div
          className="rounded-lg border p-2 text-center"
          style={{ backgroundColor: residualScoreBackground(best.residualScore) }}
        >
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
            Score
          </p>
          <p className="text-xl font-bold">{best.residualScore}</p>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-secondary)]">
        Inherent: {inherentScore} → Residual: {best.residualScore}
        {reductionPct !== null && reductionPct !== 0
          ? ` (${reductionPct > 0 ? `${reductionPct}% reduction` : `${Math.abs(reductionPct)}% increase`})`
          : ''}
        {best.assessorName ? ` - Assessed by: ${best.assessorName}` : ''}
      </p>
    </div>
  );
}

export default function RiskDetailPageContent({
  projectId,
  riskId,
}: {
  projectId: string;
  riskId: string;
}): React.ReactNode {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<StatusActionKey | null>(null);
  const [mitigationOpen, setMitigationOpen] = useState(false);
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();

  const riskQuery = useRisk(projectId, riskId);
  const acceptRisk = useAcceptRisk();
  const closeRisk = useCloseRisk();
  const reopenRisk = useReopenRisk();
  const deleteRisk = useDeleteRisk();

  const risk = riskQuery.data;
  const canEdit =
    Boolean(risk) && (epc.navFullAccess || risk!.ownerId === currentUserId);
  const canAct = Boolean(
    risk &&
      (risk.ownerId === currentUserId ||
        risk.createdBy === currentUserId ||
        pm.projects.canView),
  );
  const canAddMitigation =
    canAct && (risk?.status === 'OPEN' || risk?.status === 'MITIGATED');
  const statusActionPending =
    acceptRisk.isPending || closeRisk.isPending || reopenRisk.isPending;

  async function handleStatusAction(
    action: StatusActionKey,
    notes: string,
  ): Promise<void> {
    try {
      if (action === 'accept') {
        await acceptRisk.mutateAsync({
          projectId,
          riskId,
          notes: notes || undefined,
        });
        messageApi.success('Risk accepted');
      } else if (action === 'close') {
        await closeRisk.mutateAsync({
          projectId,
          riskId,
          notes: notes || undefined,
        });
        messageApi.success('Risk closed');
      } else {
        await reopenRisk.mutateAsync({
          projectId,
          riskId,
          notes,
        });
        messageApi.success('Risk reopened');
      }
      setStatusAction(null);
    } catch (error) {
      notifyApiError(error, 'Failed to update risk status', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteRisk.mutateAsync({ projectId, riskId });
      messageApi.success('Risk deleted');
      setDeleteOpen(false);
      router.push(`/projects/${projectId}/risks`);
    } catch (error) {
      notifyApiError(error, 'Failed to delete risk', messageApi);
    }
  }

  function renderActions(): React.ReactNode {
    if (!risk || !canAct) return null;

    switch (risk.status) {
      case 'OPEN':
        return (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              This risk is open and needs a response.
            </span>
            <Button type="primary" onClick={() => setStatusAction('accept')}>
              Accept Risk
            </Button>
          </div>
        );
      case 'MITIGATED':
      case 'ACCEPTED':
        return (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>
              This risk has been {risk.status === 'ACCEPTED' ? 'accepted' : 'mitigated'}.
            </span>
            <Space wrap>
              <Button onClick={() => setStatusAction('reopen')}>Reopen</Button>
              <Button type="primary" onClick={() => setStatusAction('close')}>
                Close Risk
              </Button>
            </Space>
          </div>
        );
      case 'CLOSED':
        return (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={layout.drawerMutedText}>This risk is closed.</span>
            <Button onClick={() => setStatusAction('reopen')}>Reopen Risk</Button>
          </div>
        );
      default:
        return null;
    }
  }

  if (riskQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (riskQuery.isError || !risk) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load risk"
        description={
          riskQuery.error instanceof ApiRequestError
            ? riskQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  const mitigations = risk.mitigations ?? [];
  const bestMitigation = mitigations[0] ?? null;
  const otherMitigations = mitigations.slice(1);
  const actions = renderActions();

  return (
    <div className={layout.pageStack}>
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/risks`)}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to risks
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <span className="font-mono text-[14px] font-semibold text-[var(--color-text-primary)]">
            {risk.riskIdCode}
          </span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {risk.title}
          </h1>
          <StatusBadge
            label={formatRiskStatus(risk.status)}
            variant={riskStatusVariant(risk.status)}
          />
        </div>
        {canEdit && (
          <Button danger onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        )}
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
                    <Descriptions.Item label="Risk number">
                      {risk.riskIdCode}
                    </Descriptions.Item>
                    <Descriptions.Item label="Title">
                      {risk.title}
                    </Descriptions.Item>
                    <Descriptions.Item label="Category">
                      <StatusBadge
                        label={formatRiskCategory(risk.category)}
                        variant="default"
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Owner">
                      {resolveUserDisplay(risk.ownerId, risk.ownerName)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Scope">Project</Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <StatusBadge
                        label={formatRiskStatus(risk.status)}
                        variant={riskStatusVariant(risk.status)}
                      />
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
                </div>

                <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                  <p className={`mb-2 ${layout.drawerHeading}`}>Description</p>
                  <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                    {risk.description || 'No description provided'}
                  </p>
                </div>

                {risk.contingencyPlan && (
                  <div className={layout.drawerSurface}>
                    <p className={`mb-2 ${layout.drawerHeading}`}>Contingency plan</p>
                    <p className="whitespace-pre-wrap">{risk.contingencyPlan}</p>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'inherent-residual',
            label: 'Inherent & residual',
            children: (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className={`${layout.drawerHeading} mb-3`}>Inherent risk</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <RiskMetricCard
                      label="Likelihood"
                      value={formatRiskLikelihood(risk.probability)}
                    />
                    <RiskMetricCard
                      label="Impact"
                      value={formatRiskImpactLevel(risk.impact)}
                    />
                    <RiskMetricCard
                      label="Score"
                      value={String(risk.riskScore)}
                      variant={riskScoreVariant(risk.riskScore)}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className={layout.drawerHeading}>Mitigation & Residual Risk</h3>
                    {canAddMitigation && (
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => setMitigationOpen(true)}
                      >
                        Add Mitigation
                      </Button>
                    )}
                  </div>

                  {bestMitigation ? (
                    <BestMitigationCard
                      best={bestMitigation}
                      inherentScore={risk.riskScore}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        No mitigation assessed yet. Add a mitigation attempt to assess
                        the residual risk.
                      </p>
                    </div>
                  )}

                  {otherMitigations.length > 0 && (
                    <Collapse
                      ghost
                      items={[
                        {
                          key: 'history',
                          label: `Previous attempts (${otherMitigations.length})`,
                          children: (
                            <div className="flex flex-col gap-2">
                              {otherMitigations.map((m) => (
                                <div key={m.id} className="rounded-lg border p-3">
                                  <div className="mb-1 flex justify-between gap-2">
                                    <span className="text-xs font-medium">
                                      Attempt {m.attemptNumber}
                                    </span>
                                    <span className="text-xs text-[var(--color-text-secondary)]">
                                      {formatProjectDate(m.assessedAt)}
                                    </span>
                                  </div>
                                  <p className="mb-1 whitespace-pre-wrap text-sm">
                                    {m.mitigationStrategy}
                                  </p>
                                  <p className="text-xs text-[var(--color-text-secondary)]">
                                    Residual: {m.residualScore} (
                                    {formatRiskLikelihood(m.residualLikelihood)} ×{' '}
                                    {formatRiskImpactLevel(m.residualImpact)})
                                    {m.assessorName ? ` - ${m.assessorName}` : ''}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'review-history',
            label: 'Review history',
            children: (
              <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                {risk.reviews.length === 0 ? (
                  <p className={layout.drawerMutedText}>No reviews yet</p>
                ) : (
                  <Timeline
                    items={risk.reviews.map((review) => ({
                      content: (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-slate-700">
                            {dayjs(review.reviewedAt).format('MMM D, YYYY HH:mm')} -{' '}
                            {resolveUserDisplay(review.reviewedBy, review.reviewedByName)}
                          </span>
                          {review.previousStatus !== review.newStatus &&
                            review.newStatus && (
                              <span className="text-xs text-slate-500">
                                Status:{' '}
                                {review.previousStatus
                                  ? formatRiskStatus(review.previousStatus as RiskStatus)
                                  : '-'}{' '}
                                → {formatRiskStatus(review.newStatus as RiskStatus)}
                              </span>
                            )}
                          {review.previousScore !== review.newScore && (
                            <span className="text-xs text-slate-500">
                              Score: {review.previousScore ?? '-'} →{' '}
                              {review.newScore ?? '-'}
                            </span>
                          )}
                          {review.previousResidualScore !==
                            review.newResidualScore && (
                            <span className="text-xs text-slate-500">
                              Residual score: {review.previousResidualScore ?? '-'} →{' '}
                              {review.newResidualScore ?? '-'}
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
              </div>
            ),
          },
          {
            key: 'files',
            label: 'Files',
            children: (
              <DocumentAttachmentPanel
                folderId={risk.attachmentFolderId ?? undefined}
                readOnly={!canEdit}
                title="Attachments"
                description="Assessments, photos, and mitigation evidence."
              />
            ),
          },
        ]}
      />

      {/* Sticky bottom workflow bar */}
      {actions && (
        <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
          {actions}
        </div>
      )}

      <StatusActionModal
        open={Boolean(statusAction)}
        action={statusAction}
        loading={statusActionPending}
        onConfirm={(notes) =>
          statusAction && void handleStatusAction(statusAction, notes)
        }
        onClose={() => setStatusAction(null)}
      />

      <AddMitigationModal
        open={mitigationOpen}
        projectId={projectId}
        risk={risk}
        onClose={() => setMitigationOpen(false)}
        onUpdated={() => void riskQuery.refetch()}
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
    </div>
  );
}
