'use client';

import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useApprovalRequest } from '@/lib/query/approvals';
import { findReturnNote } from '@/lib/utils/request-edit';

/**
 * Amber callout at the top of an edit form for a RETURNED request: the
 * approver's return note (read-only) and what to do next. Saving the form
 * keeps it RETURNED; it is resubmitted from the request page.
 */
export default function ReturnedRequestCallout({
  approvalRequestId,
}: {
  approvalRequestId: string | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const approvalQuery = useApprovalRequest(approvalRequestId ?? '');
  const note = findReturnNote(approvalQuery.data?.tiers);

  return (
    <ErpNotice
      tone="warning"
      title={t('pages.approvals.edit.returnedCalloutTitle')}
      description={
        <>
          <blockquote className="m-0 mb-1 whitespace-pre-wrap break-words border-l-2 border-[#ba7517] pl-2">
            {approvalQuery.isLoading
              ? '…'
              : note ?? t('pages.approvals.edit.returnedNoNote')}
          </blockquote>
          <span>{t('pages.approvals.edit.returnedCalloutHint')}</span>
        </>
      }
    />
  );
}
