'use client';

import { Alert, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import LeavePolicyForm, {
  buildLeavePolicyRules,
  type LeavePolicyFormValues,
} from '@/components/modules/hr/leave-policy/LeavePolicyForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCreateLeavePolicy,
  useLeavePolicy,
  useUpdateLeavePolicy,
} from '@/lib/query/leave-policy';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

interface LeavePolicyFormPageContentProps {
  policyId?: string;
}

/**
 * Full-page create / edit leave policy.
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
      } else {
        await createMutation.mutateAsync(payload);
        messageApi.success(t('hr.leavePolicy.created'));
      }
      router.push('/hr/leave-policy');
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
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (isEdit && policyQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          policyQuery.error instanceof ApiRequestError
            ? policyQuery.error.message
            : t('hr.leavePolicy.loadError')
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{
            color: tokens.colorTextPrimary,
            fontFamily: tokens.fontFamily,
          }}
        >
          {isEdit
            ? t('pages.hr.leavePolicy.edit')
            : t('hr.leavePolicy.new')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {t('hr.leavePolicy.formDescription')}
        </p>
      </div>
      <LeavePolicyForm
        policy={policyQuery.data}
        isSubmitting={saving}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
