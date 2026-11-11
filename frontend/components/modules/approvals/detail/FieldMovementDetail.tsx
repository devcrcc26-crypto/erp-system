'use client';

import { useState } from 'react';
import { Alert, Button, Skeleton, Tag } from 'antd';
import { useRouter } from 'next/navigation';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { FieldMovementReason } from '@/lib/api/attendance.types';
import {
  useCancelFieldMovementLog,
  useFieldMovementLog,
} from '@/lib/query/attendance';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatDateList,
  groupBy,
} from '@/lib/utils/date-format.util';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

const REASON_LABELS: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

/**
 * Field movement body for the Approvals detail inbox.
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function FieldMovementDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useFieldMovementLog(sourceId);
  const cancelMutation = useCancelFieldMovementLog();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const log = detailQuery.data;

  if (detailQuery.isLoading && !log) {
    return (
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !log) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Field movement log not found'
        }
      />
    );
  }

  const periodLabel = new Date(log.year, log.month - 1, 1).toLocaleString(
    'en',
    { month: 'long', year: 'numeric' },
  );
  const employeeName = log.employee
    ? formatUserName(log.employee)
    : '-';
  const employeeCode = log.employee?.employeeId
    ? ` (${log.employee.employeeId})`
    : '';

  const entryGroups = groupBy(
    log.entries ?? [],
    (entry) => `${entry.reason}||${entry.destination?.trim() || ''}`,
  );

  const onBehalfCreatorName =
    log.submittedOnBehalf && log.creator ? formatUserName(log.creator) : null;

  const isOwner =
    Boolean(currentUser.data?.id) && log.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner && (log.status === 'DRAFT' || log.status === 'SUBMITTED');

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync(sourceId);
      messageApi.success(t('pages.hr.fieldMovementLogs.cancelSuccess'));
      setConfirmCancel(false);
      router.push('/approvals');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('pages.hr.fieldMovementLogs.cancelFailed'),
        messageApi,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canCancel ? (
        <div className="flex justify-end">
          <Button danger size="small" onClick={() => setConfirmCancel(true)}>
            {t('hr.buttons.cancelRequest')}
          </Button>
        </div>
      ) : null}

      {onBehalfCreatorName ? (
        <ErpNotice
          tone="info"
          title={t('pages.hr.fieldMovementLogs.submittedOnBehalf', {
            name: onBehalfCreatorName,
          })}
        />
      ) : null}
      <SummaryStrip
        items={[
          {
            label: 'Employee',
            value: `${employeeName}${employeeCode}`,
          },
          {
            label: 'Period',
            value: periodLabel,
          },
          {
            label: 'Log number',
            value: log.requestNumber,
          },
          {
            label: 'Entries',
            value: String(log.entries?.length ?? log.entryCount ?? 0),
          },
        ]}
      />

      <SectionCard title={`Entries (${log.entries?.length ?? 0} days)`}>
        <div className="erp-drawer-list">
          {Object.entries(entryGroups).map(([key, entries]) => {
            const [reasonKey, destination] = key.split('||');
            const reason = reasonKey as FieldMovementReason;
            const sample = entries[0];
            return (
              <div
                key={key}
                className="border-b border-[#E5E7EB] px-3 py-3 last:border-b-0"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#1A1A1A]">
                    {REASON_LABELS[reason] ?? reason}
                    {destination ? ` - ${destination}` : ''}
                  </span>
                  <Tag>{entries.length} day(s)</Tag>
                </div>
                <p className="m-0 mb-2 text-sm text-[#64748b]">
                  {formatDateList(entries.map((entry) => entry.date))}
                </p>
                {sample?.departureTime || sample?.returnTime || sample?.notes ? (
                  <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                    {sample.departureTime ? (
                      <MetaItem
                        label={
                          reason === 'FORGOT_CLOCK_OUT'
                            ? 'Stated clock-out'
                            : 'Departed'
                        }
                      >
                        {sample.departureTime}
                      </MetaItem>
                    ) : null}
                    {sample.returnTime ? (
                      <MetaItem
                        label={
                          reason === 'FORGOT_CLOCK_IN'
                            ? 'Stated clock-in'
                            : 'Returned'
                        }
                      >
                        {sample.returnTime}
                      </MetaItem>
                    ) : null}
                    {sample.notes?.trim() ? (
                      <MetaItem label="Notes">{sample.notes.trim()}</MetaItem>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={t('hr.table.notes') || 'Overall notes'}>
        <p className="m-0 text-sm text-[#6B7280]">
          {log.notes?.trim() || '-'}
        </p>
      </SectionCard>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.buttons.cancelRequest')}
        description={t('pages.hr.fieldMovementLogs.cancelConfirm')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
