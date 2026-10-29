'use client';

import '@/components/modules/hr/attendance/work-from-home-v2.css';

import { useMemo, useState } from 'react';
import { Button, Collapse, Input, Modal } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import WorkFromHomeRangeDays from '@/components/modules/hr/attendance/WorkFromHomeRangeDays';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import type { ApprovalRequestDetail } from '@/lib/api/approvals.types';
import {
  cancelWorkFromHomeRequest,
  type WorkFromHomeRangeDay,
  type WorkFromHomeRequestForm,
} from '@/lib/api/work-from-home.api';
import { approvalKeys } from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import { formatApprovalUserName } from '@/lib/utils/approval-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

const KEY = 'pages.hr.workFromHome.range';
const OPEN_STATUSES = ['PENDING', 'SUBMITTED', 'IN_REVIEW', 'RETURNED'];

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Work-from-home request body for the Approvals detail page: range, working
 * days, skipped days, and cancel (pending: employee / filer / HR; approved: HR).
 */
export default function WorkFromHomeDetail({
  request,
}: {
  request: ApprovalRequestDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const queryClient = useQueryClient();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const lookupUserName = useUserNameLookup();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const form = (request.formData ?? {}) as WorkFromHomeRequestForm;
  const dates = useMemo(
    () => form.dates ?? (form.date ? [form.date] : []),
    [form.dates, form.date],
  );
  const startDate = form.startDate ?? form.date ?? dates[0] ?? null;
  const endDate = form.endDate ?? form.date ?? dates[dates.length - 1] ?? null;

  const days = useMemo((): WorkFromHomeRangeDay[] => {
    const rows: WorkFromHomeRangeDay[] = [
      ...dates.map((date) => ({ date, included: true })),
      ...(form.skipped ?? []).map((row) => ({
        date: row.date,
        included: false,
        reason: row.reason,
      })),
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [dates, form.skipped]);

  const rangeLabel =
    startDate && endDate
      ? `${shortDate(startDate)}${startDate === endDate ? '' : ` – ${shortDate(endDate)}`} (${t(
          `${KEY}.daysCount`,
          { count: dates.length },
        )})`
      : '-';

  const employeeName = (() => {
    const fromRequester = formatApprovalUserName(request.requester);
    if (fromRequester !== '-') {
      return fromRequester;
    }
    if (form.employeeId) {
      return lookupUserName(form.employeeId);
    }
    return '-';
  })();

  const viewerId = currentUser.data?.id;
  const createdBy = (request as { createdBy?: string }).createdBy;
  const isOpen = OPEN_STATUSES.includes(request.status);
  const isApproved = request.status === 'APPROVED';
  const canCancel =
    (isApproved && canViewHr) ||
    (isOpen &&
      (canViewHr ||
        (viewerId != null &&
          (request.requestedBy === viewerId || createdBy === viewerId))));

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelWorkFromHomeRequest(request.id, cancelReason.trim() || undefined),
    onSuccess: (result) => {
      messageApi.success(
        result.removedDates.length > 0
          ? t(`${KEY}.cancelledRemoved`, { count: result.removedDates.length })
          : t(`${KEY}.cancelled`),
      );
      setCancelOpen(false);
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
    onError: (error: unknown) => {
      notifyApiError(error, t(`${KEY}.cancelFailed`), messageApi, t);
    },
  });

  return (
    <div className="erp-wfh-v2 flex flex-col gap-4">
      <div className="erp-wfh-detail-facts">
        <div className="erp-wfh-detail-fact">
          <p className="erp-wfh-detail-fact-label">{t(`${KEY}.period`)}</p>
          <p className="erp-wfh-detail-fact-value">{rangeLabel}</p>
        </div>
        <div className="erp-wfh-detail-fact">
          <p className="erp-wfh-detail-fact-label">{t('hr.table.employee')}</p>
          <p className="erp-wfh-detail-fact-value">{employeeName}</p>
        </div>
        <div className="erp-wfh-detail-fact">
          <p className="erp-wfh-detail-fact-label">{t(`${KEY}.workingDays`)}</p>
          <p className="erp-wfh-detail-fact-value">{dates.length}</p>
        </div>
      </div>

      <section className="erp-employee-section">
        <div className="erp-employee-section-header !justify-between gap-3">
          <h2 className="erp-employee-section-title m-0">
            {t('pages.hr.workFromHome.request.title')}
          </h2>
          {canCancel ? (
            <Button danger size="small" onClick={() => setCancelOpen(true)}>
              {t(`${KEY}.cancel`)}
            </Button>
          ) : null}
        </div>
        <div className="erp-employee-section-body">
          <div className="erp-wfh-detail-grid">
            <div className="erp-wfh-detail-field erp-wfh-detail-field--wide">
              <p className="erp-wfh-detail-field-label">
                {t('pages.hr.workFromHome.fields.reason')}
              </p>
              <p className="erp-wfh-detail-field-value">
                {form.reason || '-'}
              </p>
            </div>
            {form.cancelledAt ? (
              <div className="erp-wfh-detail-field erp-wfh-detail-field--wide">
                <p className="erp-wfh-detail-field-label">
                  {t(`${KEY}.cancelledOn`)}
                </p>
                <p className="erp-wfh-detail-field-value">
                  {formatProjectDate(form.cancelledAt)}
                  {form.cancelReason ? ` - ${form.cancelReason}` : ''}
                </p>
              </div>
            ) : null}
            {form.notAppliedDates && form.notAppliedDates.length > 0 ? (
              <div className="erp-wfh-detail-field erp-wfh-detail-field--wide">
                <p className="erp-wfh-detail-field-label">
                  {t(`${KEY}.notApplied`)}
                </p>
                <p className="erp-wfh-detail-field-value">
                  {form.notAppliedDates
                    .map((date) => formatProjectDate(date))
                    .join(', ')}
                </p>
              </div>
            ) : null}
          </div>

          <Collapse
            className="mt-4"
            size="small"
            items={[
              {
                key: 'days',
                label: t(`${KEY}.showDays`, { count: days.length }),
                children: <WorkFromHomeRangeDays days={days} />,
              },
            ]}
          />
        </div>
      </section>

      <Modal
        rootClassName="erp-wfh-cancel-modal"
        open={cancelOpen}
        title={t(`${KEY}.cancelTitle`)}
        okText={t(`${KEY}.cancel`)}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
        confirmLoading={cancelMutation.isPending}
        onOk={() => cancelMutation.mutate()}
        onCancel={() => setCancelOpen(false)}
        destroyOnHidden
      >
        <p className="m-0 mb-3 text-sm text-[rgba(0,0,0,0.65)]">
          {isApproved
            ? t(`${KEY}.cancelApprovedHint`)
            : t(`${KEY}.cancelPendingHint`)}
        </p>
        <label
          htmlFor="wfh-cancel-reason"
          className="mb-1.5 block text-[13px] text-[rgba(0,0,0,0.65)]"
        >
          {t(`${KEY}.cancelReason`)}
        </label>
        <Input.TextArea
          id="wfh-cancel-reason"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={1000}
        />
      </Modal>
    </div>
  );
}
