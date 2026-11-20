'use client';

import { MetaItem, SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PerDiemRequestDetail } from '@/lib/api/per-diem.types';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { perDiemAmounts } from '@/lib/utils/per-diem-display';

/**
 * Submitted rate (company or employee-entered), approver-set rate, days and
 * the approved total that is disbursed and settled against.
 */
export default function PerDiemRateSummary({
  request,
}: {
  request: PerDiemRequestDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const amounts = perDiemAmounts(request);
  const rateSource =
    request.rateSource ??
    (request.employeePerDiemRateId ? 'COMPANY' : 'EMPLOYEE');
  const showDisbursement =
    request.status === 'APPROVED' ||
    request.status === 'ACTIVE' ||
    request.status === 'SETTLED' ||
    amounts.disbursed > 0;

  return (
    <SectionCard title={t('hr.perDiem.rateSummary.title')} bodyClassName="px-3 py-4 sm:px-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <MetaItem label={t('hr.perDiem.rateSummary.standardRate')}>
          {t('hr.perDiem.rateSummary.perDay', {
            amount: formatEtbAmount(amounts.standardRate),
          })}
        </MetaItem>
        <MetaItem label={t('pages.approvals.dialog.perDiem.rateSource')}>
          {rateSource === 'COMPANY'
            ? t('hr.perDiem.rateSourceCompany')
            : t('hr.perDiem.rateSourceEmployee')}
        </MetaItem>
        <MetaItem label={t('hr.perDiem.rateSummary.approvedRate')}>
          {amounts.approvedRate != null ? (
            <span className="font-semibold">
              {t('hr.perDiem.rateSummary.perDay', {
                amount: formatEtbAmount(amounts.approvedRate),
              })}
            </span>
          ) : (
            <span className="text-[var(--color-text-tertiary)]">
              {t('hr.perDiem.rateSummary.notSetYet')}
            </span>
          )}
        </MetaItem>
        <MetaItem label={t('hr.perDiem.rateSummary.days')}>{amounts.days}</MetaItem>
        <MetaItem label={t('hr.perDiem.rateSummary.approvedTotal')}>
          <span className="text-base font-bold">
            {formatEtbAmount(amounts.approvedTotal)}
          </span>
        </MetaItem>
        {showDisbursement ? (
          <>
            <MetaItem label={t('hr.perDiem.rateSummary.disbursed')}>
              {formatEtbAmount(amounts.disbursed)}
            </MetaItem>
            <MetaItem label={t('hr.perDiem.rateSummary.remaining')}>
              <span className="font-semibold">{formatEtbAmount(amounts.remaining)}</span>
            </MetaItem>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
