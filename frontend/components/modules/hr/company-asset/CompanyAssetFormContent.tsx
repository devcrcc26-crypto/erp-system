'use client';

import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import CompanyAssetForm from '@/components/modules/hr/company-asset/CompanyAssetForm';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { CompanyAssetDetail } from '@/lib/api/company-asset.types';
import { useCompanyAsset } from '@/lib/query/company-asset';

/**
 * New / edit company asset — title in MainContentHeader; page shows cancel + form.
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

  useSetHeaderExtra(null);

  function handleSuccess(result: CompanyAssetDetail): void {
    router.push(`/hr/company-asset/${result.id}`);
  }

  if (isEdit && detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-company-asset-form-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <ErpNotice
          tone="error"
          title={t('hr.assetMessages.notFound')}
          action={
            <Button onClick={() => router.push('/hr/company-asset')}>
              {t('hr.assetButtons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-company-asset-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() => router.push('/hr/company-asset')}
          className="shrink-0"
        >
          {t('hr.assetButtons.cancel')}
        </Button>
      </div>
      <CompanyAssetForm
        mode={isEdit ? 'edit' : 'create'}
        asset={isEdit ? detailQuery.data : undefined}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
