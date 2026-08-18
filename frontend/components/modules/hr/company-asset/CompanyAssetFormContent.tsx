'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import CompanyAssetForm from '@/components/modules/hr/company-asset/CompanyAssetForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { CompanyAssetDetail } from '@/lib/api/company-asset.types';
import { useCompanyAsset } from '@/lib/query/company-asset';

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
    router.push(`/hr/company-asset/${result.id}`);
  }

  if (isEdit && detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('hr.assetMessages.notFound')}
        action={
          <Button onClick={() => router.push('/hr/company-asset')}>
            {t('hr.assetButtons.backToList')}
          </Button>
        }
      />
    );
  }

  return (
    <FormLayout
      title={
        isEdit
          ? t('hr.assetButtons.editAsset')
          : t('hr.assetButtons.newAsset')
      }
      description={t('pages.hr.companyAsset.formDescription')}
      extra={
        <Button onClick={() => router.push('/hr/company-asset')}>
          {t('hr.assetButtons.cancel')}
        </Button>
      }
    >
      <CompanyAssetForm
        mode={isEdit ? 'edit' : 'create'}
        asset={isEdit ? detailQuery.data : undefined}
        onSuccess={handleSuccess}
      />
    </FormLayout>
  );
}
