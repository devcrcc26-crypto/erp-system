'use client';

import { Tag } from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { LateSubmissionMeta } from '@/lib/api/approvals.types';

/**
 * Approver-facing late submission notice (badge + reason + on-behalf filer).
 */
export default function LateSubmissionBanner({
  lateSubmission,
  onBehalfSubmittedByName,
}: {
  lateSubmission: LateSubmissionMeta | null | undefined;
  onBehalfSubmittedByName?: string | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  if (!lateSubmission?.isLate) {
    return null;
  }

  const reason = lateSubmission.reason?.trim();
  const onBehalfName = onBehalfSubmittedByName?.trim();

  return (
    <div className="flex flex-col gap-2">
      <Tag color="orange" className="w-fit">
        {t('pages.approvals.lateSubmissionBadge', {
          month: lateSubmission.monthLabel,
        })}
      </Tag>
      <ErpNotice
        tone="warning"
        title={t('pages.approvals.lateSubmissionBadge', {
          month: lateSubmission.monthLabel,
        })}
        description={
          <>
            {reason ? (
              <p className="m-0 mb-1">
                {t('pages.approvals.lateSubmissionReason', { reason })}
              </p>
            ) : null}
            {onBehalfName ? (
              <p className="m-0">
                {t('pages.approvals.lateSubmissionOnBehalf', {
                  name: onBehalfName,
                })}
              </p>
            ) : null}
          </>
        }
      />
    </div>
  );
}
