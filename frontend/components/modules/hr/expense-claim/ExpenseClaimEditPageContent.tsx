'use client';

import { useEffect } from 'react';
import { Alert, Button, Form, Input, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
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
      <div className="flex justify-center p-12">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.expenseClaimNotFound')
        }
        action={
          <Button
            onClick={() => router.push('/hr/expense-claims')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.backToList')}
          </Button>
        }
      />
    );
  }

  if (!canEdit) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('hr.messages.cannotEditExpenseClaim')}
        action={
          <Button
            onClick={() => router.push(`/hr/expense-claims/${claimId}`)}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.back')}
          </Button>
        }
      />
    );
  }

  return (
    <HrFormPageShell
      title={t('pages.hr.expenseClaim.edit')}
      description={t('pages.hr.expenseClaim.formDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref={`/hr/expense-claims/${claimId}`}
      headerExtra={
        <Button
          type="primary"
          loading={updateMutation.isPending}
          onClick={() => form.submit()}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.save')}
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <SectionCard
          title={t('hr.section.requestDetails')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
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
              />
            </Form.Item>
            <Form.Item name="description" label={t('hr.form.description')}>
              <Input.TextArea rows={4} maxLength={4000} showCount />
            </Form.Item>
          </Form>
        </SectionCard>
      </div>
    </HrFormPageShell>
  );
}
