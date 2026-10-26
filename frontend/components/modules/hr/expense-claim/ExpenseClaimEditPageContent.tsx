'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useEffect } from 'react';
import { Alert, Button, Form, Input, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-expense-claim-form-page ${DETAIL_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
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
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
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
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-expense-claim-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.expenseClaim.edit')}
        description={t('pages.hr.expenseClaim.editDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref={`/hr/expense-claims/${claimId}`}
        backLabel={t('hr.buttons.back')}
        headerExtra={
          <Button
            type="primary"
            loading={updateMutation.isPending}
            onClick={() => form.submit()}
          >
            {t('hr.buttons.save')}
          </Button>
        }
      >
        <FormLayout
          variant="pro"
          title={t('hr.section.requestDetails')}
          description={
            claim.claimNumber
              ? `${claim.claimNumber} · ${t('pages.hr.expenseClaim.detailsStepDescription')}`
              : t('pages.hr.expenseClaim.detailsStepDescription')
          }
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
      </HrFormPageShell>
    </div>
  );
}
