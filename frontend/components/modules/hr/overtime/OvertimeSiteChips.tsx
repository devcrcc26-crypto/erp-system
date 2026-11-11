'use client';

import './overtime-entries-v2.css';

import { Tooltip } from 'antd';
import { EnvironmentOutlined, WarningOutlined } from '@ant-design/icons';
import type { OvertimeEntry } from '@/lib/api/overtime.types';
import { formatOvertimeHours } from '@/lib/utils/overtime-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * "Site assignment" label, within-scheduled-hours subtotal and HR review flag
 * for one overtime entry. Renders nothing for office-day entries.
 */
export default function OvertimeSiteChips({
  entry,
}: {
  entry: Pick<
    OvertimeEntry,
    'siteAssignmentId' | 'siteName' | 'siteWithinScheduleHours' | 'siteReviewFlag'
  >;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  if (!entry.siteAssignmentId && !entry.siteReviewFlag) {
    return null;
  }
  const within = Number(entry.siteWithinScheduleHours ?? 0);

  return (
    <div className="erp-ot-pills">
      {entry.siteAssignmentId ? (
        <Tooltip
          title={
            entry.siteName
              ? t('pages.hr.overtime.siteAssignmentAt', { site: entry.siteName })
              : undefined
          }
        >
          <span className="erp-ot-pill" data-kind="site" tabIndex={0}>
            <EnvironmentOutlined aria-hidden />
            {t('pages.hr.overtime.siteAssignment')}
          </span>
        </Tooltip>
      ) : null}
      {within > 0 ? (
        <span className="erp-ot-pill" data-kind="site">
          {t('pages.hr.overtime.withinScheduleSiteHours', {
            hours: formatOvertimeHours(within),
          })}
        </span>
      ) : null}
      {entry.siteReviewFlag ? (
        <Tooltip
          title={
            entry.siteReviewFlag === 'ASSIGNMENT_CANCELLED'
              ? t('pages.hr.overtime.siteReviewCancelled')
              : t('pages.hr.overtime.siteReviewShortened')
          }
        >
          <span className="erp-ot-pill" data-kind="warning" tabIndex={0}>
            <WarningOutlined aria-hidden />
            {t('pages.hr.overtime.siteReviewFlag')}
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
}
