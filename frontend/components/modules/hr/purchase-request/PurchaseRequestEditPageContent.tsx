'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useEffect } from 'react';
import { Alert, Button, DatePicker, Form, Input, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import {
  usePurchaseRequest,
  useUpdatePurchaseRequest,
} from '@/lib/query/purchase-request';
import { useCurrentUser } from '@/lib/query/profile';
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
 * Edit purchase request header when DRAFT or RETURNED.
 */
export default function PurchaseRequestEditPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const [form] = Form.useForm<HeaderFormValues>();
  const vendorName = Form.useWatch('vendorName', form);
  const detailQuery = usePurchaseRequest(requestId);
  const updateMutation = useUpdatePurchaseRequest(requestId);

  const request = detailQuery.data;
  const canEdit =
    Boolean(request) &&
    (request?.status === 'DRAFT' || request?.status === 'RETURNED') &&
    (canViewHr ||
      (Boolean(currentUser.data?.id) &&
        request?.employeeId === currentUser.data?.id));

  useEffect(() => {
    if (!request) {
      return;
    }
    form.setFieldsValue({
      title: request.title,
      justification: request.justification,
      requiredByDate: request.requiredByDate
        ? dayjs(request.requiredByDate)
        : null,
      vendorName: request.vendorName ?? undefined,
      vendorEmail: request.vendorEmail ?? undefined,
      vendorPhone: request.vendorPhone ?? undefined,
    });
  }, [request, form]);

  async function handleSubmit(values: HeaderFormValues): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        title: values.title.trim(),
        justification: values.justification.trim(),
        requiredByDate: values.requiredByDate
          ? values.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        vendorName: values.vendorName?.trim() || undefined,
        vendorEmail: values.vendorEmail?.trim() || undefined,
        vendorPhone: values.vendorPhone?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.purchaseRequestUpdated'));
      router.push(`/hr/purchase-requests/${requestId}`);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToUpdatePurchaseRequest'),
        messageApi,
        t,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.purchaseRequestNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/purchase-requests')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page">
        <Alert
          type="warning"
          showIcon
          title={t('hr.messages.cannotEditPurchaseRequest')}
          action={
            <Button
              onClick={() => router.push(`/hr/purchase-requests/${requestId}`)}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-purchase-request-form-page">
      <HrFormPageShell
        title={t('pages.hr.purchaseRequest.edit')}
        description={t('pages.hr.purchaseRequest.editDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref={`/hr/purchase-requests/${requestId}`}
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
            request.requestNumber
              ? `${request.requestNumber} · ${t('pages.hr.purchaseRequest.detailsStepDescription')}`
              : t('pages.hr.purchaseRequest.detailsStepDescription')
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
              <Form.Item
                name="requiredByDate"
                label={t('hr.form.requiredByDate')}
              >
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
              className="!mb-0"
            >
              <Input.TextArea
                rows={4}
                maxLength={2000}
                showCount
                placeholder={t('hr.placeholder.enterJustification')}
              />
            </Form.Item>
          </Form>
        </FormLayout>
      </HrFormPageShell>
    </div>
  );
}
