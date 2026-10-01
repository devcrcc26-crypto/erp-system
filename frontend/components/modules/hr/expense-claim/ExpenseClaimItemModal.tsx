'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { disableFutureDates } from '@/lib/utils/date-validation';
import type {
  ExpenseClaimItem,
  SupportedCurrency,
} from '@/lib/api/expense-claim.types';
import { useCurrencyRates } from '@/lib/query/currency';
import {
  useAddExpenseClaimItem,
  useUpdateExpenseClaimItem,
} from '@/lib/query/expense-claim';
import { detailDrawerStyles } from '@/lib/theme/layout';
import {
  formatCurrencyAmount,
  formatEtbAmount,
} from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ItemFormValues {
  category: string;
  description: string;
  expenseDate: dayjs.Dayjs;
  amount: number;
  currency: SupportedCurrency;
}

const CURRENCY_OPTIONS = [
  { value: 'ETB', label: 'ETB - Ethiopian Birr' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
];

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#e8ebef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#e8ebef] bg-[#fafbfc] px-4 py-2.5">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
          {title}
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/**
 * Add/edit drawer for a single expense claim line item, with live ETB preview.
 */
export default function ExpenseClaimItemModal({
  open,
  claimId,
  editingItem,
  onClose,
}: {
  open: boolean;
  claimId: string;
  editingItem: ExpenseClaimItem | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<ItemFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const ratesQuery = useCurrencyRates(open);
  const addMutation = useAddExpenseClaimItem(claimId);
  const updateMutation = useUpdateExpenseClaimItem(claimId);

  const amount = Form.useWatch('amount', form);
  const currency = Form.useWatch('currency', form) as
    | SupportedCurrency
    | undefined;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingItem) {
      form.setFieldsValue({
        category: editingItem.category,
        description: editingItem.description,
        expenseDate: dayjs(editingItem.expenseDate),
        amount: Number(editingItem.amount),
        currency: editingItem.currency,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ currency: 'ETB' });
    }
    setSelectedFiles([]);
  }, [open, editingItem, form]);

  const etbPreview = useMemo(() => {
    if (!amount || !currency) {
      return null;
    }
    if (currency === 'ETB') {
      return amount;
    }
    const rate = ratesQuery.data?.[currency];
    if (!rate) {
      return null;
    }
    return amount * rate;
  }, [amount, currency, ratesQuery.data]);

  async function handleSubmit(values: ItemFormValues): Promise<void> {
    const payload = {
      category: values.category.trim(),
      description: values.description.trim(),
      expenseDate: values.expenseDate.format('YYYY-MM-DD'),
      amount: values.amount,
      currency: values.currency,
      file: selectedFiles[0],
    };
    try {
      if (editingItem) {
        await updateMutation.mutateAsync({ itemId: editingItem.id, payload });
        messageApi.success(t('hr.messages.expenseClaimItemUpdated'));
      } else {
        if (!payload.file) {
          messageApi.warning(t('hr.messages.attachReceiptRequired'));
          return;
        }
        await addMutation.mutateAsync(payload);
        messageApi.success(t('hr.messages.expenseClaimItemAdded'));
      }
      onClose();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSaveExpenseClaimItem'),
        messageApi,
      );
    }
  }

  const saving = addMutation.isPending || updateMutation.isPending;
  const title = editingItem
    ? t('hr.dialog.editExpenseItemTitle')
    : t('hr.dialog.addExpenseItemTitle');

  return (
    <Drawer
      open={open}
      title={
        <div className="min-w-0 py-1">
          <div className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
            {title}
          </div>
          <div className="mt-0.5 text-[12px] font-normal text-[var(--color-text-secondary)]">
            {editingItem
              ? t('hr.dialog.editExpenseItemHint')
              : t('hr.dialog.addExpenseItemHint')}
          </div>
        </div>
      }
      size={520}
      className="erp-responsive-drawer erp-expense-item-drawer"
      styles={detailDrawerStyles}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="erp-expense-item-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} disabled={saving}>
            {t('hr.buttons.cancel')}
          </Button>
          <Button
            type="primary"
            loading={saving}
            onClick={() => form.submit()}
          >
            {t('hr.buttons.save')}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className="erp-drawer-form"
        onFinish={(values) => void handleSubmit(values)}
      >
        <div className="flex flex-col gap-4">
          <DrawerSection title={t('hr.section.itemDetails')}>
            <Form.Item
              name="category"
              label={t('hr.form.category')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.categoryRequired'),
                },
              ]}
            >
              <Input
                placeholder={t('hr.placeholder.enterCategory')}
                maxLength={100}
              />
            </Form.Item>

            <Form.Item
              name="description"
              label={t('hr.form.description')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.descriptionRequired'),
                },
              ]}
            >
              <Input.TextArea
                rows={2}
                maxLength={500}
                showCount
                placeholder={t('hr.placeholder.enterDescription')}
              />
            </Form.Item>

            <Form.Item
              name="expenseDate"
              label={t('hr.form.expenseDate')}
              className="!mb-0"
              rules={[
                {
                  required: true,
                  message: t('hr.validation.expenseDateRequired'),
                },
              ]}
            >
              <DatePicker
                      className="w-full"
                      format="DD/MM/YYYY"
                      disabledDate={disableFutureDates}
                    />
            </Form.Item>
          </DrawerSection>

          <DrawerSection title={t('hr.section.amountAndCurrency')}>
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <Form.Item
                name="amount"
                label={t('hr.form.amount')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.amountRequired'),
                  },
                ]}
              >
                <InputNumber className="w-full" min={0.01} precision={2} />
              </Form.Item>
              <Form.Item
                name="currency"
                label={t('hr.form.currency')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.currencyRequired'),
                  },
                ]}
              >
                <Select options={CURRENCY_OPTIONS} />
              </Form.Item>
            </div>

            {etbPreview !== null ? (
              <div className="rounded-lg border border-[#1D9E75]/30] bg-[#E1F5EE] px-3 py-2.5">
                <p className="m-0 text-[10px] font-medium uppercase tracking-[0.04em] text-[#0F6E56]">
                  {t('hr.form.etbEquivalent')}
                </p>
                <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-[#0F6E56]">
                  {formatEtbAmount(etbPreview)}
                </p>
                {currency && currency !== 'ETB' && amount ? (
                  <p className="m-0 mt-0.5 text-[12px] text-[#0F6E56]/80">
                    {formatCurrencyAmount(amount, currency)}
                  </p>
                ) : null}
              </div>
            ) : (
              <Typography.Paragraph
                type="secondary"
                className="!mb-0 text-[13px]"
              >
                {t('hr.labels.etbPreviewEmpty')}
              </Typography.Paragraph>
            )}
          </DrawerSection>

          <DrawerSection title={t('hr.form.receipt')}>
            <Form.Item
              required={!editingItem}
              className="!mb-0"
              extra={
                editingItem?.receipt
                  ? t('hr.hints.replaceReceipt', {
                      name: editingItem.receipt.name,
                    })
                  : t('hr.hints.receiptRequired')
              }
            >
              <FileUploadInput
                files={selectedFiles}
                onChange={setSelectedFiles}
                accept=".pdf,.jpg,.jpeg,.png"
                multiple={false}
                disabled={saving}
              />
            </Form.Item>
          </DrawerSection>
        </div>
      </Form>
    </Drawer>
  );
}
