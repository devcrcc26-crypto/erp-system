'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import ExpenseClaimForm from '@/components/modules/hr/expense-claim/ExpenseClaimForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ExpenseClaimDetail } from '@/lib/api/expense-claim.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { expenseClaimKeys } from '@/lib/query/expense-claim';

/**
 * New expense claim page - shared HR form banner + stepper form.
 */
export default function ExpenseClaimFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: ExpenseClaimDetail): Promise<void> {
    queryClient.setQueryData(expenseClaimKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [expenseClaimKeys.all, expenseClaimKeys.detail(created.id)],
    });
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-expense-claim-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.expenseClaim.new')}
        description={t('pages.hr.expenseClaim.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <ExpenseClaimForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
