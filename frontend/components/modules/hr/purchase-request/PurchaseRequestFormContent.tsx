'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useEffect } from 'react';
import { Alert, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import PurchaseRequestNewForm from '@/components/modules/hr/purchase-request/PurchaseRequestNewForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useCanCreatePurchaseRequest } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';

/**
 * New purchase request — header only, then detail page for line items and submit.
 */
export default function PurchaseRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const permLoading = usePermissionsLoading();
  const canCreate = useCanCreatePurchaseRequest();

  useEffect(() => {
    if (!permLoading && !canCreate) {
      router.replace('/approvals/new');
    }
  }, [permLoading, canCreate, router]);

  if (permLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!canCreate) {
    return (
      <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-purchase-request-form-page">
      <HrFormPageShell
        title={t('pages.hr.purchaseRequest.new')}
        description={t('pages.hr.purchaseRequest.newFormDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <PurchaseRequestNewForm />
      </HrFormPageShell>
    </div>
  );
}
