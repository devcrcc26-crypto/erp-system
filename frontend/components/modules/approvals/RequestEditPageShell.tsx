'use client';

import ReturnedRequestCallout from '@/components/modules/approvals/ReturnedRequestCallout';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Edit-page chrome around a module's create form in edit mode: shared
 * banner plus, for a RETURNED request, the approver's note in an amber
 * callout above the form.
 */
export default function RequestEditPageShell({
  status,
  approvalRequestId,
  backHref,
  className = '',
  children,
}: {
  status: string;
  approvalRequestId: string | null | undefined;
  backHref: string;
  /** Module page classes (same as its create page) for consistent styling. */
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <div className={className}>
      <HrFormPageShell
        title={t('pages.approvals.edit.pageTitle')}
        description={t('pages.approvals.edit.pageDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref={backHref}
        backLabel={t('hr.buttons.back')}
        showCancelButton={false}
      >
        {status === 'RETURNED' ? (
          <ReturnedRequestCallout approvalRequestId={approvalRequestId} />
        ) : null}
        {children}
      </HrFormPageShell>
    </div>
  );
}

/** Where to go after saving / cancelling: the approval if any, else the record. */
export function requestEditBackHref(
  approvalRequestId: string | null | undefined,
  recordHref: string,
): string {
  return approvalRequestId ? `/approvals/${approvalRequestId}` : recordHref;
}
