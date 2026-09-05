'use client';

import { Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import LeavePolicyForm, {
  buildLeavePolicyRules,
  type LeavePolicyFormValues,
} from '@/components/modules/hr/leave-policy/LeavePolicyForm';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import {
  useCreateLeavePolicy,
  useLeavePolicy,
  useUpdateLeavePolicy,
} from '@/lib/query/leave-policy';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/leave-policy';

interface LeavePolicyFormPageContentProps {
  policyId?: string;
}

/**
 * Create / edit leave policy — title in MainContentHeader; cancel + form.
 */
export default function LeavePolicyFormPageContent({
  policyId,
}: LeavePolicyFormPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const isEdit = Boolean(policyId);
  const policyQuery = useLeavePolicy(policyId ?? '', isEdit);
  const createMutation = useCreateLeavePolicy();
  const updateMutation = useUpdateLeavePolicy(policyId ?? '');

  const saving = createMutation.isPending || updateMutation.isPending;

  useSetHeaderExtra(null);

  async function handleSubmit(values: LeavePolicyFormValues): Promise<void> {
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      governedBy: values.governedBy?.trim() || undefined,
      isActive: values.isActive,
      rules: buildLeavePolicyRules(values),
    };

    try {
      if (isEdit && policyId) {
        await updateMutation.mutateAsync(payload);
        messageApi.success(t('hr.leavePolicy.updated'));
        router.push(`${LIST_PATH}/${policyId}`);
      } else {
        const created = await createMutation.mutateAsync(payload);
        messageApi.success(t('hr.leavePolicy.created'));
        router.push(`${LIST_PATH}/${created.id}`);
      }
    } catch (error: unknown) {
      notifyApiError(
        error,
        isEdit
          ? t('hr.leavePolicy.updateFailed')
          : t('hr.leavePolicy.createFailed'),
        messageApi,
      );
    }
  }

  if (isEdit && policyQuery.isLoading && !policyQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-policy-form-page flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (isEdit && policyQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-policy-form-page">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            policyQuery.error,
            t('hr.leavePolicy.loadError'),
            t,
          )}
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-policy-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() =>
            router.push(
              isEdit && policyId ? `${LIST_PATH}/${policyId}` : LIST_PATH,
            )
          }
          className="shrink-0"
        >
          {t('common.cancel')}
        </Button>
      </div>
      <LeavePolicyForm
        policy={policyQuery.data}
        isSubmitting={saving}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
        formId="leave-policy-form"
        showFooterActions={false}
      />
      <FormPageFooter
        submitLabel={t('common.save')}
        formId="leave-policy-form"
        useFormAttribute
        isSubmitting={saving}
      />
    </div>
  );
}
