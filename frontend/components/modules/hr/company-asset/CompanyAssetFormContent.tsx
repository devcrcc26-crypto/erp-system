'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import CompanyAssetForm from '@/components/modules/hr/company-asset/CompanyAssetForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { CompanyAssetDetail } from '@/lib/api/company-asset.types';
import { useCompanyAsset } from '@/lib/query/company-asset';

/**
 * New / edit company asset page — Add Employee chrome.
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
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('hr.assetMessages.notFound')}
        action={
          <Button
            onClick={() => router.push('/hr/company-asset')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.assetButtons.back')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
            onClick={() => router.push('/hr/company-asset')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
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
