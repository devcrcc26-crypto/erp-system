'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
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
  const messageApi = useAppMessage();
  const [form] = Form.useForm<ItemFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const ratesQuery = useCurrencyRates(open);
  const addMutation = useAddExpenseClaimItem(claimId);
  const updateMutation = useUpdateExpenseClaimItem(claimId);

  const amount = Form.useWatch('amount', form);
  const currency = Form.useWatch('currency', form) as SupportedCurrency | undefined;

  useEffect(() => {
    if (!open) return;
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
    if (!amount || !currency) return null;
    if (currency === 'ETB') return amount;
    const rate = ratesQuery.data?.[currency];
    if (!rate) return null;
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
        messageApi.success('Item updated');
      } else {
        if (!payload.file) {
          messageApi.warning('Attach a receipt for this item');
          return;
        }
        await addMutation.mutateAsync(payload);
        messageApi.success('Item added');
      }
      onClose();
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to save item', messageApi);
    }
  }

  const saving = addMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      title={editingItem ? 'Edit Expense Item' : 'Add Expense Item'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          name="category"
          label="Category"
          rules={[{ required: true, message: 'Category is required' }]}
        >
          <Input placeholder="e.g. Travel, Meals, Accommodation" maxLength={100} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, message: 'Description is required' }]}
        >
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>

        <Form.Item
          name="expenseDate"
          label="Expense Date"
          rules={[{ required: true, message: 'Expense date is required' }]}
        >
          <DatePicker className="w-full" format="DD/MM/YYYY" />
        </Form.Item>

        <div className="grid grid-cols-2 gap-3">
          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true, message: 'Amount is required' }]}
          >
            <InputNumber className="w-full" min={0.01} precision={2} />
          </Form.Item>
          <Form.Item
            name="currency"
            label="Currency"
            rules={[{ required: true, message: 'Currency is required' }]}
          >
            <Select options={CURRENCY_OPTIONS} />
          </Form.Item>
        </div>

        {etbPreview !== null ? (
          <Alert
            type="info"
            showIcon
            className="mb-4"
            title={`ETB Equivalent: ${formatEtbAmount(etbPreview)}${
              currency && currency !== 'ETB' && amount
                ? ` (${formatCurrencyAmount(amount, currency)})`
                : ''
            }`}
          />
        ) : null}

        <Form.Item
          label="Receipt"
          required={!editingItem}
          extra={
            editingItem?.receipt
              ? `Current receipt: ${editingItem.receipt.name}. Upload a new file to replace it`
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
