'use client';

import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSiteAssignmentOvertimeImpact } from '@/lib/query/site-assignment';

const DETAIL = 'pages.hr.siteAssignments.detail';

/**
 * Shows how many overtime entries a cancel (endDate null) or shorten (endDate
 * set) will recalculate or flag, on the HR confirmation modals.
 */
export default function SiteAssignmentOvertimeImpact({
  id,
  mode,
  endDate,
  open,
}: {
  id: string;
  mode: 'cancel' | 'shorten';
  /** YYYY-MM-DD; required for a shorten. */
  endDate: string | null;
  open: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const ready = mode === 'cancel' || Boolean(endDate);
  const impact = useSiteAssignmentOvertimeImpact(
    id,
    mode === 'cancel' ? null : endDate,
    open && ready,
  );

  if (!ready) {
    return (
      <p className="m-0 mb-3 text-[12px] text-[var(--color-text-secondary)]">
        {t(`${DETAIL}.overtimeImpactPickDate`)}
      </p>
    );
  }
  if (impact.isLoading) {
    return (
      <p className="m-0 mb-3 text-[12px] text-[var(--color-text-secondary)]" role="status">
        {t(`${DETAIL}.overtimeImpactLoading`)}
      </p>
    );
  }
  if (!impact.data) {
    return null;
  }

  const { unsubmitted, submitted } = impact.data;
  if (unsubmitted === 0 && submitted === 0) {
    return (
      <p className="m-0 mb-3 text-[12px] text-[var(--color-text-secondary)]" role="status">
        {t(`${DETAIL}.overtimeImpactNone`)}
      </p>
    );
  }

  return (
    <ErpNotice
      tone="warning"
      className="mb-3"
      title={
        submitted > 0
          ? t(`${DETAIL}.overtimeImpactSubmitted`, { count: submitted })
          : t(`${DETAIL}.overtimeImpactUnsubmitted`, { count: unsubmitted })
      }
      description={
        submitted > 0 && unsubmitted > 0
          ? t(`${DETAIL}.overtimeImpactUnsubmitted`, { count: unsubmitted })
          : undefined
      }
    />
  );
}
