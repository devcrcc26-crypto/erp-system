'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Skeleton, Tag, Typography } from 'antd';
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

  const request = detailQuery.data;
  const isOwner = request?.employeeId === currentUser.data?.id;
  const canCancel = isOwner && ['DRAFT', 'SUBMITTED'].includes(request?.status ?? '');

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.inspectionRepairCancelled'));
      router.push('/hr/inspection-repair');
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.inspectionRepairCancelFailed'), messageApi);
    }
  }

  async function handleStatusUpdate(status: 'IN_REPAIR' | 'REPAIRED' | 'REJECTED'): Promise<void> {
    if (!request) {
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
        status,
      });
      messageApi.success(t('hr.messages.inspectionRepairUpdated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.inspectionRepairUpdateFailed'), messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !request) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.inspectionRepairNotFound')
        }
        action={<Button onClick={() => router.push('/hr/inspection-repair')}>{t('hr.buttons.backToList')}</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button type="text" icon={<ArrowLeft size={16} />} onClick={() => router.push('/hr/inspection-repair')}>
          {t('hr.buttons.back')}
        </Button>
        {canCancel ? (
          <Button danger className="ml-auto" onClick={() => setConfirmCancel(true)}>
            {t('hr.buttons.cancelRequest')}
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg overflow-hidden" style={{ background: tokens.colorCardBg, border: `1px solid ${tokens.colorBorder}` }}>
            <div className="px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tokens.colorTextTertiary }}>
                  {request.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>|</span>
                <StatusBadge
                  label={formatInspectionRepairStatus(request.status, t)}
                  variant={inspectionRepairStatusVariant(request.status)}
                />
                {request.assetId ? <Tag color="blue">{t('hr.form.asset')}</Tag> : <Tag>{t('hr.form.deviceName')}</Tag>}
              </div>
              <h2 className="m-0 text-lg font-semibold leading-snug" style={{ color: tokens.colorTextPrimary }}>
                {request.deviceName}
              </h2>
              <p className="m-0 mt-1 text-sm" style={{ color: tokens.colorTextSecondary }}>
                {formatInspectionRepairEmployeeName(request.employee)}
                {request.submittedAt ? ` | ${t('hr.table.submittedDate')} ${formatProjectDate(request.submittedAt)}` : null}
              </p>
            </div>
          </div>

          <SummaryStrip
            items={[
              { label: t('hr.form.inspectionType'), value: t(`hr.inspectionType.${request.inspectionType}`) },
              { label: t('hr.form.urgency'), value: t(`hr.urgency.${request.urgency}`) },
              { label: t('hr.form.location'), value: request.location },
              {
                label: t('hr.labels.completedAt'),
                value: request.completedAt ? formatProjectDate(request.completedAt) : '-',
              },
            ]}
          />

          <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {request.asset ? (
                <MetaItem label={t('hr.form.asset')}>
                  {request.asset.serialNumber} - {request.asset.brand} {request.asset.model}
                </MetaItem>
              ) : null}
              <MetaItem label={t('hr.form.deviceName')}>{request.deviceName}</MetaItem>
              <MetaItem label={t('hr.form.make')}>{request.make ?? '-'}</MetaItem>
              <MetaItem label={t('hr.form.model')}>{request.model ?? '-'}</MetaItem>
              <MetaItem label={t('hr.form.year')}>{request.year?.toString() ?? '-'}</MetaItem>
              <MetaItem label={t('hr.form.location')}>{request.location}</MetaItem>
              <MetaItem label={t('hr.form.description')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">{request.description}</p>
              </MetaItem>
              <MetaItem label={t('hr.form.solution')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">{request.solution ?? '-'}</p>
              </MetaItem>
            </div>
          </SectionCard>

          {canViewHr ? (
            <SectionCard title={t('common.actions')} bodyClassName="px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleStatusUpdate('IN_REPAIR')} loading={updateMutation.isPending}>
                  {t('hr.status.IN_REPAIR')}
                </Button>
                <Button type="primary" onClick={() => void handleStatusUpdate('REPAIRED')} loading={updateMutation.isPending}>
                  {t('hr.status.REPAIRED')}
                </Button>
                <Button danger onClick={() => void handleStatusUpdate('REJECTED')} loading={updateMutation.isPending}>
                  {t('hr.status.REJECTED')}
                </Button>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-4 py-4">
            {tiers.length > 0 ? (
              <ApprovalTierTimeline
                tiers={tiers}
                currentTier={request.approvalRequest?.currentTier ?? 1}
              />
            ) : (
              <Typography.Text type="secondary">
                {t('hr.empty.noApprovalChain')}
              </Typography.Text>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.empty.cancelInspectionRepairTitle')}
        description={t('hr.empty.cancelInspectionRepairDescription')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
