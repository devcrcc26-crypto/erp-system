'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Form, Radio, Skeleton, Tag, Typography } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import type { InspectionRepairStatus } from '@/lib/api/inspection-repair.types';
import {
  useCancelInspectionRepair,
  useInspectionRepair,
  useUpdateInspectionRepair,
} from '@/lib/query/inspection-repair';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  formatInspectionRepairEmployeeName,
  formatInspectionRepairStatus,
  inspectionRepairStatusVariant,
} from '@/lib/utils/inspection-repair-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

type HrWorkflowStatus = Extract<
  InspectionRepairStatus,
  'IN_REPAIR' | 'REPAIRED' | 'REJECTED'
>;

const STATUS_TRANSITIONS: Partial<
  Record<InspectionRepairStatus, HrWorkflowStatus[]>
> = {
  SUBMITTED: ['IN_REPAIR', 'REJECTED'],
  IN_REPAIR: ['REPAIRED', 'REJECTED'],
};

export default function InspectionRepairDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useInspectionRepair(requestId);
  const cancelMutation = useCancelInspectionRepair(requestId);
  const updateMutation = useUpdateInspectionRepair(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<
    HrWorkflowStatus | undefined
  >();

  const request = detailQuery.data;
  const isOwner = request?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner && ['DRAFT', 'SUBMITTED'].includes(request?.status ?? '');

  const nextStatuses = useMemo(
    () => (request ? (STATUS_TRANSITIONS[request.status] ?? []) : []),
    [request],
  );
  const canUpdateStatus = canViewHr && nextStatuses.length > 0;

  const statusOptions = useMemo(
    () =>
      nextStatuses.map((status) => ({
        value: status,
        label: formatInspectionRepairStatus(status, t),
        hint: t(`hr.inspectionRepairStatusHint.${status}`),
      })),
    [nextStatuses, t],
  );

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  function openStatusModal(): void {
    setPendingStatus(nextStatuses[0]);
    setStatusModalOpen(true);
  }

  function closeStatusModal(): void {
    setStatusModalOpen(false);
    setPendingStatus(undefined);
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.inspectionRepairCancelled'));
      router.push('/hr/inspection-repair');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.inspectionRepairCancelFailed'),
        messageApi,
      );
    }
  }

  async function handleStatusUpdate(): Promise<void> {
    if (!request || !pendingStatus) {
      return;
    }
    try {
      await updateMutation.mutateAsync({
        assetId: request.assetId ?? undefined,
        deviceName: request.assetId ? undefined : request.deviceName,
        location: request.location,
        make: request.make ?? undefined,
        model: request.model ?? undefined,
        year: request.year ?? undefined,
        description: request.description,
        solution: request.solution ?? undefined,
        urgency: request.urgency,
        inspectionType: request.inspectionType,
        status: pendingStatus,
      });
      messageApi.success(t('hr.messages.inspectionRepairUpdated'));
      closeStatusModal();
      await detailQuery.refetch();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.inspectionRepairUpdateFailed'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.inspectionRepairNotFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/inspection-repair')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/inspection-repair')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.back')}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canUpdateStatus ? (
            <Button
              type="primary"
              onClick={openStatusModal}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.updateStatus')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              danger
              onClick={() => setConfirmCancel(true)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.cancelRequest')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div
            className="overflow-hidden rounded-none"
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <div className="px-3 py-4 sm:px-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {request.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatInspectionRepairStatus(request.status, t)}
                  variant={inspectionRepairStatusVariant(request.status)}
                />
                {request.assetId ? (
                  <Tag style={{ borderRadius: 0 }}>{t('hr.form.asset')}</Tag>
                ) : (
                  <Tag style={{ borderRadius: 0 }}>
                    {t('hr.form.deviceName')}
                  </Tag>
                )}
              </div>
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {request.deviceName}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatInspectionRepairEmployeeName(request.employee)}
                {request.submittedAt
                  ? ` · ${t('hr.table.submittedDate')} ${formatProjectDate(request.submittedAt)}`
                  : null}
              </p>
            </div>
          </div>

          <SummaryStrip
            items={[
              {
                label: t('hr.form.inspectionType'),
                value: t(`hr.inspectionType.${request.inspectionType}`),
              },
              {
                label: t('hr.form.urgency'),
                value: t(`hr.urgency.${request.urgency}`),
              },
              { label: t('hr.form.location'), value: request.location },
              {
                label: t('hr.labels.completedAt'),
                value: request.completedAt
                  ? formatProjectDate(request.completedAt)
                  : '—',
              },
            ]}
          />

          <SectionCard
            title={t('hr.section.requestDetails')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {request.asset ? (
                <MetaItem label={t('hr.form.asset')}>
                  {request.asset.serialNumber} — {request.asset.brand}{' '}
                  {request.asset.model}
                </MetaItem>
              ) : null}
              <MetaItem label={t('hr.form.deviceName')}>
                {request.deviceName}
              </MetaItem>
              <MetaItem label={t('hr.form.make')}>
                {request.make ?? '—'}
              </MetaItem>
              <MetaItem label={t('hr.form.model')}>
                {request.model ?? '—'}
              </MetaItem>
              <MetaItem label={t('hr.form.year')}>
                {request.year?.toString() ?? '—'}
              </MetaItem>
              <MetaItem label={t('hr.form.location')}>
                {request.location}
              </MetaItem>
              <MetaItem label={t('hr.form.description')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {request.description}
                </p>
              </MetaItem>
              <MetaItem label={t('hr.form.solution')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {request.solution ?? '—'}
                </p>
              </MetaItem>
            </div>
          </SectionCard>

          {canViewHr ? (
            <SectionCard
              title={t('hr.section.updateStatus')}
              bodyClassName="px-3 py-4 sm:px-5"
              action={
                canUpdateStatus ? (
                  <Button
                    type="primary"
                    onClick={openStatusModal}
                    style={{ borderRadius: 0 }}
                  >
                    {t('hr.buttons.updateStatus')}
                  </Button>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-4">
                <div
                  className="rounded-none border px-3 py-3"
                  style={{
                    borderColor: tokens.colorBorder,
                    background: tokens.colorSurfaceSecondary,
                  }}
                >
                  <p
                    className="mb-1 text-xs font-medium uppercase tracking-wide"
                    style={{ color: tokens.colorTextTertiary }}
                  >
                    {t('hr.assetDialog.statusCurrentLabel')}
                  </p>
                  <StatusBadge
                    label={formatInspectionRepairStatus(request.status, t)}
                    variant={inspectionRepairStatusVariant(request.status)}
                  />
                </div>

                {canUpdateStatus ? (
                  <>
                    <p
                      className="m-0 text-sm"
                      style={{ color: tokens.colorTextSecondary }}
                    >
                      {t('hr.messages.inspectionRepairStatusActionsHint')}
                    </p>
                    <div className="flex flex-col gap-2">
                      {statusOptions.map((option) => (
                        <div
                          key={option.value}
                          className="flex items-start gap-3 rounded-none border px-3 py-3"
                          style={{ borderColor: tokens.colorBorder }}
                        >
                          <StatusBadge
                            label={option.label}
                            variant={inspectionRepairStatusVariant(
                              option.value,
                            )}
                          />
                          <p
                            className="m-0 flex-1 text-xs leading-snug"
                            style={{ color: tokens.colorTextSecondary }}
                          >
                            {option.hint}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Alert
                    type="info"
                    showIcon
                    title={t('hr.messages.inspectionRepairStatusLocked')}
                  />
                )}
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          {tiers.length > 0 ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={request.approvalRequest?.currentTier ?? 1}
            />
          ) : (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-4"
            >
              <Typography.Text type="secondary">
                {t('hr.empty.noApprovalChain')}
              </Typography.Text>
            </SectionCard>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={statusModalOpen}
        title={t('hr.dialog.updateInspectionRepairStatusTitle')}
        description={`${t('hr.dialog.updateInspectionRepairStatusDesc')} (${request.requestNumber} · ${request.deviceName})`}
        confirmLabel={t('hr.buttons.updateStatus')}
        cancelLabel={t('hr.buttons.cancel')}
        confirmLoading={updateMutation.isPending}
        confirmDisabled={!pendingStatus || pendingStatus === request.status}
        onConfirm={() => void handleStatusUpdate()}
        onCancel={closeStatusModal}
      >
        <div className="mt-3 flex flex-col gap-4">
          <div
            className="rounded-none border px-3 py-3"
            style={{
              borderColor: tokens.colorBorder,
              background: tokens.colorSurfaceSecondary,
            }}
          >
            <p
              className="mb-1 text-xs font-medium uppercase tracking-wide"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('hr.assetDialog.statusCurrentLabel')}
            </p>
            <StatusBadge
              label={formatInspectionRepairStatus(request.status, t)}
              variant={inspectionRepairStatusVariant(request.status)}
            />
          </div>

          <Form layout="vertical" requiredMark={false}>
            <Form.Item
              label={t('hr.assetDialog.statusSelectLabel')}
              className="mb-0"
            >
              <Radio.Group
                value={pendingStatus}
                onChange={(event) =>
                  setPendingStatus(event.target.value as HrWorkflowStatus)
                }
                disabled={updateMutation.isPending}
                className="w-full"
              >
                <div className="flex w-full flex-col gap-2">
                  {statusOptions.map((option) => {
                    const selected = pendingStatus === option.value;
                    return (
                      <label
                        key={option.value}
                        className="m-0 flex w-full cursor-pointer items-center gap-3 rounded-none border px-3 py-3"
                        style={{
                          borderColor: selected
                            ? tokens.colorPrimary
                            : tokens.colorBorder,
                          background: selected
                            ? tokens.colorPrimaryLight
                            : tokens.colorCardBg,
                        }}
                      >
                        <Radio value={option.value} className="m-0" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1">
                            <StatusBadge
                              label={option.label}
                              variant={inspectionRepairStatusVariant(
                                option.value,
                              )}
                            />
                          </div>
                          <p
                            className="m-0 text-xs leading-snug"
                            style={{ color: tokens.colorTextSecondary }}
                          >
                            {option.hint}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Radio.Group>
            </Form.Item>
          </Form>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.empty.cancelInspectionRepairTitle')}
        description={t('hr.empty.cancelInspectionRepairDescription')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        cancelLabel={t('hr.buttons.cancel')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
