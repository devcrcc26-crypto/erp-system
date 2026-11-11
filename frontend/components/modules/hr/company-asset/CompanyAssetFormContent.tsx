'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import CompanyAssetForm from '@/components/modules/hr/company-asset/CompanyAssetForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { CompanyAssetDetail } from '@/lib/api/company-asset.types';
import { useCompanyAsset } from '@/lib/query/company-asset';

const LIST_PATH = '/hr/company-asset';

/**
 * New / edit company asset - shared HR form banner + stepper form.
 */
export default function CompanyAssetFormContent({
  assetId,
}: {
  assetId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const isEdit = Boolean(assetId);
  const detailQuery = useCompanyAsset(assetId ?? '', isEdit);

  function handleSuccess(result: CompanyAssetDetail): void {
    router.push(`${LIST_PATH}/${result.id}`);
  }

  if (isEdit && detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-company-asset-form-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page">
        <ErpNotice
          tone="error"
          title={t('hr.assetMessages.notFound')}
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('hr.assetButtons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-company-asset-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={
          isEdit
            ? t('pages.hr.companyAsset.edit')
            : t('pages.hr.companyAsset.new')
        }
        description={t('pages.hr.companyAsset.formDescription')}
        cancelLabel={t('hr.assetButtons.cancel')}
        cancelHref={LIST_PATH}
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <CompanyAssetForm
          mode={isEdit ? 'edit' : 'create'}
          asset={isEdit ? detailQuery.data : undefined}
          onSuccess={handleSuccess}
          onCancel={() => router.push(LIST_PATH)}
          cancelLabel={t('hr.assetButtons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
