'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import AssetRequestForm from '@/components/modules/hr/asset-request/AssetRequestForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPost } from '@/lib/api/client';
import type { AssetRequestDetail } from '@/lib/api/asset-request.types';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { assetRequestKeys } from '@/lib/query/asset-request';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * New asset request. AssetRequestForm only creates a draft, so submit it for
 * approval here (same create-then-submit flow as Material Requisition).
 */
export default function NewAssetRequestPage(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const messageApi = useAppMessage();

  async function handleSuccess(created: AssetRequestDetail): Promise<void> {
    try {
      await apiPost<AssetRequestDetail>(`/hr/asset-requests/${created.id}/submit`, {});
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.assetRequestSubmitFailed'), messageApi, t);
      return;
    }
    messageApi.success(t('hr.messages.assetRequestSubmitted'));
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [assetRequestKeys.all],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page">
      <HrFormPageShell
        title={t('pages.hr.assetRequest.new')}
        description={t('pages.hr.assetRequest.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <AssetRequestForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
