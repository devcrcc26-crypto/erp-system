'use client';

import { Tag } from 'antd';
import OvertimeEditDiffBanner from '@/components/modules/approvals/detail/OvertimeEditDiffBanner';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useOvertimeSheet } from '@/lib/query/overtime';

/**
 * Approver chrome for OT: Edited badge + diff banner.
 * Isolated so ApprovalDetailPageContent hook counts stay stable.
 */
export function OvertimeEditedBadge({
  sheetId,
}: {
  sheetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const sheetQuery = useOvertimeSheet(sheetId);
  const edited =
    sheetQuery.data?.editedAfterApproval ||
    sheetQuery.data?.editDiff?.editedAfterApproval;
  if (!edited) {
    return null;
  }
  return (
    <Tag color="orange" className="!m-0 rounded-lg">
      {t('pages.hr.overtime.editedBadge')}
    </Tag>
  );
}

/**
 * Diff summary shown above Decide actions when OT was edited after approval.
 */
export function OvertimeApprovalEditDiff({
  sheetId,
}: {
  sheetId: string;
}): React.ReactNode {
  const sheetQuery = useOvertimeSheet(sheetId);
  const editDiff = sheetQuery.data?.editDiff;
  if (!editDiff?.editedAfterApproval) {
    return null;
  }
  return (
    <div className="border-t border-[var(--color-border)] px-4 py-3 sm:px-5">
      <OvertimeEditDiffBanner editDiff={editDiff} />
    </div>
  );
}
