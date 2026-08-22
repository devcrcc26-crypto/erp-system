'use client';

import { Alert, Button, Form, Input } from 'antd';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useCreateExpenseClaim } from '@/lib/query/expense-claim';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ClaimFormValues {
  title: string;
  description?: string;
}

/**
 * Standalone expense claim creation form under Approvals → New Request.
 * Creates a draft, then continues to the claim detail page to add line
 * items (with live currency conversion) and submit for approval.
 */
export default function ExpenseClaimFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<ClaimFormValues>();
  const createMutation = useCreateExpenseClaim();

  async function handleSubmit(values: ClaimFormValues): Promise<void> {
    try {
      const created = await createMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.draftClaimCreated'));
      router.push(`/hr/expense-claims/${created.id}`);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCreateExpenseClaim'),
        messageApi,
      );
    }
  }

  return (
    <HrFormPageShell
      title={t('pages.hr.expenseClaim.new')}
      description={t('pages.hr.expenseClaim.formDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
      headerExtra={
        <Button
          type="primary"
          loading={createMutation.isPending}
          onClick={() => form.submit()}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.next')}
        </Button>
      }
    >
      {createMutation.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            createMutation.error instanceof ApiRequestError
              ? createMutation.error.message
              : t('hr.messages.failedToCreateExpenseClaim')
          }
        />
      ) : null}

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
