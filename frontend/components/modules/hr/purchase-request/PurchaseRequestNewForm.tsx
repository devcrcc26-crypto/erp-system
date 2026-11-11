'use client';

import { useState } from 'react';
import { Button, DatePicker, Form, Input } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCreatePurchaseRequest } from '@/lib/query/purchase-request';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface HeaderFormValues {
  title: string;
  justification: string;
  requiredByDate?: dayjs.Dayjs | null;
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
}

/**
 * Creates a draft purchase request (header only), then opens the detail page for line items.
 */
export default function PurchaseRequestNewForm(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<HeaderFormValues>();
  const vendorName = Form.useWatch('vendorName', form);
  const createMutation = useCreatePurchaseRequest();
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue(): Promise<void> {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const created = await createMutation.mutateAsync({
        title: values.title.trim(),
        justification: values.justification.trim(),
        requiredByDate: values.requiredByDate
          ? values.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        vendorName: values.vendorName?.trim() || undefined,
        vendorEmail: values.vendorEmail?.trim() || undefined,
        vendorPhone: values.vendorPhone?.trim() || undefined,
      });
      router.replace(`/hr/purchase-requests/${created.id}`);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(
        error,
        t('hr.messages.failedToCreatePurchaseRequest'),
        messageApi,
        t,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormLayout
        variant="pro"
        title={t('hr.section.requestDetails')}
        description={t('pages.hr.purchaseRequest.detailsStepDescription')}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="erp-drawer-form"
          onFinish={() => void handleContinue()}
        >
          <Form.Item
            name="title"
            label={t('hr.form.title')}
            rules={[
              { required: true, message: t('hr.validation.titleRequired') },
            ]}
          >
            <Input
              placeholder={t('hr.placeholder.enterTitle')}
              maxLength={200}
              size="large"
            />
          </Form.Item>

          <div className="erp-form-grid-2">
            <Form.Item name="requiredByDate" label={t('hr.form.requiredByDate')}>
              <DatePicker
                className="w-full"
                disabledDate={(date) => date.isBefore(dayjs(), 'day')}
              />
            </Form.Item>

            <Form.Item name="vendorName" label={t('hr.form.vendor')}>
              <Input
                placeholder={t('hr.placeholder.enterVendor')}
                maxLength={200}
              />
            </Form.Item>

            {vendorName ? (
              <>
                <Form.Item
                  name="vendorEmail"
                  label={t('hr.form.vendorEmail')}
                  rules={[
                    {
                      type: 'email',
                      message: t('common.invalidEmail'),
                    },
                  ]}
                >
                  <Input
                    type="email"
                    placeholder={t('hr.placeholder.enterVendorEmail')}
                    maxLength={320}
                  />
                </Form.Item>
                <Form.Item
                  name="vendorPhone"
                  label={t('hr.form.vendorPhone')}
                >
                  <Input
                    placeholder={t('hr.placeholder.enterVendorPhone')}
                    maxLength={50}
                  />
                </Form.Item>
              </>
            ) : null}
          </div>

          <Form.Item
            name="justification"
            label={t('hr.form.justification')}
            rules={[
              {
                required: true,
                message: t('hr.validation.justificationRequired'),
              },
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={2000}
              showCount
              placeholder={t('hr.placeholder.enterJustification')}
            />
          </Form.Item>

          <div className="flex justify-end pt-2">
            <Button
              type="primary"
              size="large"
              loading={submitting || createMutation.isPending}
              onClick={() => form.submit()}
            >
              {t('hr.buttons.continueToItems')}
            </Button>
          </div>
        </Form>
      </FormLayout>
    </div>
  );
}
