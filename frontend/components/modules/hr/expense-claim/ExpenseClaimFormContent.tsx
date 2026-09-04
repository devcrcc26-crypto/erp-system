'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import ExpenseClaimForm from '@/components/modules/hr/expense-claim/ExpenseClaimForm';
import type { ExpenseClaimDetail } from '@/lib/api/expense-claim.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New expense claim page — same page chrome as Add Employee (`/users/new`).
 */
export default function ExpenseClaimFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: ExpenseClaimDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/expense-claims/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-expense-claim-form-page">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          onClick={() => router.push('/approvals/new')}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <ExpenseClaimForm onSuccess={handleSuccess} />
    </div>
  );
}
