'use client';

import { Alert, Button, Form, Input, Space } from 'antd';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import { useCreateExpenseClaim } from '@/lib/query/expense-claim';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
      messageApi.success('Draft claim created. Add your expense items next');
      router.push(`/hr/expense-claims/${created.id}`);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to create expense claim', messageApi);
    }
  }

  return (
    <FormLayout
      title="New Expense Claim"
      description="Start with claim details, then add line items with receipts on the next page."
      extra={
        <Space>
          <Button onClick={() => router.push('/approvals/new')}>
            {t('hr.buttons.cancel')}
          </Button>
          <Button
            type="primary"
            loading={createMutation.isPending}
            onClick={() => form.submit()}
          >
            {t('hr.buttons.next')}
          </Button>
        </Space>
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
              : 'Failed to create claim'
          }
        />
      ) : null}

      <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
        <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              name="title"
              label={t('hr.form.title')}
              rules={[{ required: true, message: 'Enter a title for this claim' }]}
            >
              <Input placeholder={t('hr.placeholder.enterTitle')} maxLength={200} />
            </Form.Item>
            <Form.Item name="description" label={t('hr.form.description')}>
              <Input.TextArea rows={4} maxLength={4000} showCount />
            </Form.Item>
          </Form>
        </SectionCard>
      </div>
    </FormLayout>
  );
}
