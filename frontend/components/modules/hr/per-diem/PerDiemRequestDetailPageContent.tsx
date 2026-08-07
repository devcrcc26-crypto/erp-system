'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCancelPerDiemRequest,
  usePerDiemRequest,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import { formatEtbAmount, formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Per diem request detail with approval tier sidebar.
 */
export default function PerDiemRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = usePerDiemRequest(requestId);
  const cancelMutation = useCancelPerDiemRequest(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const request = detailQuery.data;
  const isOwner = Boolean(request) && request?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner && (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Per diem request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel request', messageApi);
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
            : 'Per diem request not found'
        }
        action={
          <Button onClick={() => router.push('/hr/per-diem')}>
            Back to list
          </Button>
        }
      />
    );
  }

  const linkedTravel = request.linkedFlight
    ? `Flight ${request.linkedFlight.applicationNumber} - ${request.linkedFlight.destination}`
    : request.linkedTrip
      ? `Business Trip ${request.linkedTrip.tripNumber} - ${request.linkedTrip.destinationCity}, ${request.linkedTrip.destinationCountry}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="mb-2">
        <button
          onClick={() => router.push('/hr/per-diem')}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-3 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Per Diem Requests</span>
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
              Per Diem · {request.requestNumber}
            </p>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)] leading-tight">
              {request.destination}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {formatPerDiemEmployeeName(request.employee)}
              {request.submittedAt
                ? ` · Submitted ${formatProjectDate(request.submittedAt)}`
                : null}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge
              label={formatPerDiemStatus(request.status, t)}
              variant={perDiemStatusVariant(request.status)}
            />
            {canCancel ? (
              <Button danger size="small" onClick={() => setConfirmCancel(true)}>
                {t('hr.buttons.cancel')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  {t('hr.labels.destinationCategory')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {request.destinationCategory}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  {t('hr.labels.destination')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {request.destination}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  {t('hr.labels.startDate')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatProjectDate(request.startDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  {t('hr.labels.endDate')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatProjectDate(request.endDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  {t('hr.labels.days')}
                </dt>
                <dd className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {request.days}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  {t('hr.labels.dailyRate')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatCurrencyAmount(request.dailyRate, request.currency)}
                </dd>
              </div>
              {linkedTravel ? (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    {t('hr.labels.linkedTravel')}
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {linkedTravel}
                  </dd>
                </div>
              ) : null}
              {request.notes ? (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    {t('hr.labels.notes')}
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
                    {request.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
            <div className="divide-y divide-[rgba(0,0,0,0.06)]">
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Total ({request.days} day{request.days === 1 ? '' : 's'} ×{' '}
                  {formatCurrencyAmount(request.dailyRate, request.currency)})
                </span>
                <span className="text-sm text-[var(--color-text-primary)]">
                  {formatCurrencyAmount(request.totalAmount, request.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center px-5 py-3 bg-[var(--color-surface-secondary)]">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Total (ETB)
                </span>
                <span className="text-base font-bold text-[var(--color-text-primary)]">
                  {formatEtbAmount(request.totalAmountEtb)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {request.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={request.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Approval Chain
                </h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  No approval workflow linked.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel per diem request?"
        description="This will cancel the request and release any pending approval. This cannot be undone."
        confirmLabel="Cancel request"
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
