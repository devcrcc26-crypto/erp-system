'use client';

import './leave-policy-v2.css';

import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import LeavePolicyForm, {
  buildLeavePolicyRules,
  type LeavePolicyFormValues,
} from '@/components/modules/hr/leave-policy/LeavePolicyForm';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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
 * Create / edit leave policy - v2 hero + stepper form.
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
  const backHref =
    isEdit && policyId ? `${LIST_PATH}/${policyId}` : LIST_PATH;

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
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-policy-form-page erp-leave-policy-v2">
        <div className="erp-leave-policy-loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (isEdit && policyQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-policy-form-page erp-leave-policy-v2">
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-policy-form-page erp-leave-policy-v2 flex flex-col">
      <HrFormPageShell
        title={
          isEdit
            ? t('pages.hr.leavePolicy.edit')
            : t('pages.hr.leavePolicy.new')
        }
        description={t('hr.leavePolicy.formDescription')}
        cancelLabel={t('common.cancel')}
        cancelHref={backHref}
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <LeavePolicyForm
          policy={policyQuery.data}
          isSubmitting={saving}
          submitLabel={t('common.save')}
          onSubmit={handleSubmit}
          onCancel={() => router.push(backHref)}
          cancelLabel={t('common.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
