'use client';

import { useEffect } from 'react';
import { Alert, Button, Form, Input, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useExpenseClaim, useUpdateExpenseClaim } from '@/lib/query/expense-claim';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ClaimFormValues {
  title: string;
  description?: string;
}

/**
 * Edit expense claim header (title/description) when DRAFT or RETURNED.
 */
export default function ExpenseClaimEditPageContent({
  claimId,
}: {
  claimId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const [form] = Form.useForm<ClaimFormValues>();
  const detailQuery = useExpenseClaim(claimId);
  const updateMutation = useUpdateExpenseClaim(claimId);

  useSetHeaderExtra(null);

  const claim = detailQuery.data;
  const canEdit =
    Boolean(claim) &&
    (claim?.status === 'DRAFT' || claim?.status === 'RETURNED') &&
    (canViewHr ||
      (Boolean(currentUser.data?.id) &&
        claim?.employeeId === currentUser.data?.id));

  useEffect(() => {
    if (!claim) {
      return;
    }
    form.setFieldsValue({
      title: claim.title,
      description: claim.description ?? undefined,
    });
  }, [claim, form]);

  async function handleSubmit(values: ClaimFormValues): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.expenseClaimUpdated'));
      router.push(`/hr/expense-claims/${claimId}`);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToUpdateExpenseClaim'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-expense-claim-form-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.expenseClaimNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/expense-claims')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <Alert
          type="warning"
          showIcon
          title={t('hr.messages.cannotEditExpenseClaim')}
          action={
            <Button
              onClick={() => router.push(`/hr/expense-claims/${claimId}`)}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-expense-claim-form-page">
      <div className="erp-expense-claim-edit-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <Button
          onClick={() => router.push(`/hr/expense-claims/${claimId}`)}
          className="shrink-0"
        >
          {t('hr.buttons.cancel')}
        </Button>
        <Button
          type="primary"
          loading={updateMutation.isPending}
          onClick={() => form.submit()}
          className="shrink-0"
        >
          {t('hr.buttons.save')}
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-0 sm:px-0">
        <div className="overflow-hidden rounded-[12px] border border-[#e8ebef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="border-b border-[#e8ebef] bg-[#fafbfc] px-4 py-3 sm:px-5">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
              {claim.claimNumber}
            </p>
            <h2 className="m-0 mt-1 text-[17px] font-semibold leading-snug text-[var(--color-text-primary)]">
              {t('pages.hr.expenseClaim.edit')}
            </h2>
            <p className="m-0 mt-1.5 text-[13px] text-[var(--color-text-secondary)]">
              {t('pages.hr.expenseClaim.editDescription')}
            </p>
          </div>
        </div>

        <FormLayout
          variant="pro"
          title={t('hr.section.requestDetails')}
          description={t('pages.hr.expenseClaim.detailsStepDescription')}
        >
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            className="erp-drawer-form"
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              name="title"
              label={t('hr.form.title')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.titleRequired'),
                },
              ]}
            >
              <Input
                placeholder={t('hr.placeholder.enterTitle')}
                maxLength={200}
                size="large"
              />
            </Form.Item>
            <Form.Item
              name="description"
              label={t('hr.form.description')}
              className="!mb-0"
              extra={t('pages.hr.expenseClaim.descriptionHint')}
            >
              <Input.TextArea
                rows={4}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterExpenseClaimDescription')}
              />
            </Form.Item>
          </Form>
        </FormLayout>
      </div>
    </div>
  );
}
