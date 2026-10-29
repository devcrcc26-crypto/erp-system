'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
} from 'antd';
import dayjs from 'dayjs';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { disableFutureDates } from '@/lib/utils/date-validation';
import type { ExpenseClaimItem } from '@/lib/api/expense-claim.types';
import {
  useAddExpenseClaimItem,
  useUpdateExpenseClaimItem,
} from '@/lib/query/expense-claim';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { itemReceiptDocuments } from '@/lib/utils/expense-claim-display';

import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ItemFormValues {
  category: string;
  description: string;
  expenseDate: dayjs.Dayjs;
  amount: number;
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-expense-item-section">
      <div className="erp-expense-item-section-header">
        <h3 className="erp-expense-item-section-title">{title}</h3>
      </div>
      <div className="erp-expense-item-section-body">{children}</div>
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
  const addMutation = useAddExpenseClaimItem(claimId);
  const updateMutation = useUpdateExpenseClaimItem(claimId);

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
      });
    } else {
      form.resetFields();
    }
    setSelectedFiles([]);
  }, [open, editingItem, form]);

  async function handleSubmit(values: ItemFormValues): Promise<void> {
    const payload = {
      category: values.category.trim(),
      description: values.description.trim(),
      expenseDate: values.expenseDate.format('YYYY-MM-DD'),
      amount: values.amount,
      currency: 'ETB' as const,
      // All selected files are receipts of this one item.
      files: selectedFiles,
    };
    try {
      if (editingItem) {
        await updateMutation.mutateAsync({ itemId: editingItem.id, payload });
        messageApi.success(t('hr.messages.expenseClaimItemUpdated'));
      } else {
        if (payload.files.length === 0) {
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
  const editingReceipts = editingItem ? itemReceiptDocuments(editingItem) : [];
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

          <DrawerSection title={t('hr.form.amount')}>
            <Form.Item
              name="amount"
              className="!mb-0"
              rules={[
                {
                  required: true,
                  message: t('hr.validation.amountRequired'),
                },
              ]}
            >
              <InputNumber className="w-full" min={0.01} precision={2} addonAfter="ETB" />
            </Form.Item>
          </DrawerSection>

          <DrawerSection title={t('hr.form.receipt')}>
            <Form.Item
              required={!editingItem}
              className="!mb-0"
              extra={
                editingReceipts.length > 0
                  ? t('hr.hints.replaceReceipt', {
                      name: editingReceipts.map((doc) => doc.name).join(', '),
                    })
                  : t('hr.hints.receiptRequired')
              }
            >
              <FileUploadInput
                files={selectedFiles}
                onChange={setSelectedFiles}
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                disabled={saving}
              />
            </Form.Item>
          </DrawerSection>
        </div>
      </Form>
    </Drawer>
  );
}
