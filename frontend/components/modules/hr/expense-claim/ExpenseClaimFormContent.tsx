'use client';

import { useRouter } from 'next/navigation';
import ExpenseClaimForm from '@/components/modules/hr/expense-claim/ExpenseClaimForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ExpenseClaimDetail } from '@/lib/api/expense-claim.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New expense claim page - shared HR form banner + stepper form.
 */
export default function ExpenseClaimFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: ExpenseClaimDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/expense-claims/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-expense-claim-form-page">
      <HrFormPageShell
        title={t('pages.hr.expenseClaim.new')}
        description={t('pages.hr.expenseClaim.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <ExpenseClaimForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
