'use client';

import { Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useOvertimeSheet } from '@/lib/query/overtime';

/**
 * Approver chrome for OT: the Edited badge in the page banner. The diff
 * itself is shown once, inside OvertimeRequestDetail.
 * Isolated so ApprovalDetailPageContent hook counts stay stable.
 */
export function OvertimeEditedBadge({
  sheetId,
}: {
  sheetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const sheetQuery = useOvertimeSheet(sheetId);
  const sheet = sheetQuery.data;
  const editedByApprover =
    sheet?.editedByApprover || sheet?.editDiff?.editedByApprover;
  const editedAfterApproval =
    sheet?.editedAfterApproval || sheet?.editDiff?.editedAfterApproval;
  if (!editedByApprover && !editedAfterApproval) {
    return null;
  }
  return (
    <Tag color="orange" className="!m-0 rounded-lg">
      {editedByApprover
        ? t('pages.hr.overtime.editedByApproverBadge')
        : t('pages.hr.overtime.editedBadge')}
    </Tag>
  );
}
