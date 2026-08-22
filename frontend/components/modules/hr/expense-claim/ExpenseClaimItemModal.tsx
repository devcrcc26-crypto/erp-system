'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ExpenseClaimItem, SupportedCurrency } from '@/lib/api/expense-claim.types';
import { useCurrencyRates } from '@/lib/query/currency';
import {
  useAddExpenseClaimItem,
  useUpdateExpenseClaimItem,
} from '@/lib/query/expense-claim';
import { formatCurrencyAmount, formatEtbAmount } from '@/lib/utils/expense-claim-display';
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

/**
 * Add/edit modal for a single expense claim line item, with live ETB preview.
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
  const currency = Form.useWatch('currency', form) as SupportedCurrency | undefined;

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
      form.setFieldsValue({ currency: 'ETB', expenseDate: dayjs() });
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

  return (
    <Modal
      title={
        editingItem
          ? t('hr.dialog.editExpenseItemTitle')
          : t('hr.dialog.addExpenseItemTitle')
      }
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
      width={520}
      okButtonProps={{ style: { borderRadius: 0 } }}
      cancelButtonProps={{ style: { borderRadius: 0 } }}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => void handleSubmit(values)}
      >
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
          <Input placeholder={t('hr.placeholder.enterCategory')} maxLength={100} />
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
          rules={[
            {
              required: true,
              message: t('hr.validation.expenseDateRequired'),
            },
          ]}
        >
          <DatePicker className="w-full" format="DD/MM/YYYY" />
        </Form.Item>

        <div className="grid grid-cols-2 gap-3">
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
          <Alert
            type="info"
            showIcon
            className="mb-4"
            title={`${t('hr.form.etbEquivalent')}: ${formatEtbAmount(etbPreview)}${
              currency && currency !== 'ETB' && amount
                ? ` (${formatCurrencyAmount(amount, currency)})`
                : ''
            }`}
          />
        ) : null}

        <Form.Item
          label={t('hr.form.receipt')}
          required={!editingItem}
          extra={
            editingItem?.receipt
              ? t('hr.hints.replaceReceipt', { name: editingItem.receipt.name })
              : undefined
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
      </Form>
    </Modal>
  );
}
