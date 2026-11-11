'use client';

import { useEffect, useState } from 'react';
import { Form, Input, InputNumber } from 'antd';
import HrItemFormDrawer from '@/components/modules/hr/shared/HrItemFormDrawer';
import { HrDrawerFormSection } from '@/components/modules/hr/shared/HrFormItemsSection';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  AddPurchaseRequestItemPayload,
  PurchaseRequestItem,
} from '@/lib/api/purchase-request.types';
import {
  useAddPurchaseRequestItem,
  useUpdatePurchaseRequestItem,
} from '@/lib/query/purchase-request';
import {
  formatPurchaseItemDescriptionInput,
  parsePurchaseItemDescription,
} from '@/lib/utils/purchase-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type ItemFormValues = Omit<
  AddPurchaseRequestItemPayload,
  'description' | 'modelSpec'
> & {
  descriptionWithModelSpec?: string;
};

/**
 * Add/edit drawer for a purchase request line item on the detail page.
 */
export default function PurchaseRequestItemDrawer({
  open,
  requestId,
  editingItem,
  onClose,
}: {
  open: boolean;
  requestId: string;
  editingItem: PurchaseRequestItem | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<ItemFormValues>();
  const [itemImageFiles, setItemImageFiles] = useState<File[]>([]);
  const addMutation = useAddPurchaseRequestItem(requestId);
  const updateMutation = useUpdatePurchaseRequestItem(requestId);

  const saving = addMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingItem) {
      form.setFieldsValue({
        itemName: editingItem.itemName,
        descriptionWithModelSpec: formatPurchaseItemDescriptionInput(
          editingItem.description,
          editingItem.modelSpec,
        ),
        quantity: Number(editingItem.quantity),
        unit: editingItem.unit,
        unitPrice: Number(editingItem.unitPrice),
      });
    } else {
      form.resetFields();
    }
    setItemImageFiles([]);
  }, [open, editingItem, form]);

  async function handleSave(): Promise<void> {
    try {
      const values = await form.validateFields();
      const { description, modelSpec } = parsePurchaseItemDescription(
        values.descriptionWithModelSpec,
      );
      const payload = {
        itemName: values.itemName.trim(),
        modelSpec,
        description,
        quantity: Number(values.quantity),
        unit: values.unit.trim(),
        unitPrice: Number(values.unitPrice),
        currency: 'ETB' as const,
        ...(itemImageFiles.length > 0 ? { files: itemImageFiles } : {}),
      };
      if (editingItem) {
        await updateMutation.mutateAsync({
          itemId: editingItem.id,
          payload,
        });
        messageApi.success(t('hr.messages.purchaseRequestItemUpdated'));
      } else {
        await addMutation.mutateAsync(payload);
        messageApi.success(t('hr.messages.purchaseRequestItemAdded'));
      }
      onClose();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(
        error,
        editingItem
          ? t('hr.messages.purchaseRequestItemUpdateFailed')
          : t('hr.messages.failedToSavePurchaseRequestItem'),
        messageApi,
        t,
      );
    }
  }

  const title = editingItem
    ? t('hr.form.editItem')
    : t('hr.form.newItem');
  const hint = editingItem
    ? t('hr.dialog.editPurchaseItemHint')
    : t('hr.dialog.addPurchaseItemHint');

  return (
    <HrItemFormDrawer
      open={open}
      onClose={onClose}
      editing={Boolean(editingItem)}
      title={title}
      hint={hint}
      onSave={handleSave}
      drawerClassName="erp-purchase-item-drawer"
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        component={false}
        className="erp-drawer-form"
      >
        <HrDrawerFormSection title={t('hr.section.itemDetails')}>
          <div className="erp-hr-item-drawer-grid">
            <Form.Item
              name="itemName"
              label={t('hr.form.itemName')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.itemNameRequired'),
                },
              ]}
            >
              <Input maxLength={200} disabled={saving} />
            </Form.Item>
            <Form.Item
              name="descriptionWithModelSpec"
              label={t('hr.form.descriptionWithModelSpec')}
              className="erp-hr-item-drawer-span-2"
            >
              <Input.TextArea
                rows={2}
                maxLength={1502}
                showCount
                disabled={saving}
                placeholder={t('hr.placeholder.enterDescriptionWithModelSpec')}
              />
            </Form.Item>
            <Form.Item
              name="quantity"
              label={t('hr.form.quantity')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.quantityRequired'),
                },
              ]}
            >
              <InputNumber min={0.001} className="w-full" disabled={saving} />
            </Form.Item>
            <Form.Item
              name="unit"
              label={t('hr.form.unit')}
              rules={[
                { required: true, message: t('hr.validation.unitRequired') },
              ]}
            >
              <Input
                placeholder={t('hr.placeholder.enterUnit')}
                maxLength={50}
                disabled={saving}
              />
            </Form.Item>
            <Form.Item
              name="unitPrice"
              label={t('hr.form.unitPrice')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.unitPriceRequired'),
                },
              ]}
            >
              <InputNumber
                min={0}
                className="w-full"
                addonAfter="ETB"
                disabled={saving}
              />
            </Form.Item>
          </div>
        </HrDrawerFormSection>
        <HrDrawerFormSection title={t('hr.form.itemImage')}>
          <FileUploadInput
            files={itemImageFiles}
            onChange={setItemImageFiles}
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            multiple
            disabled={saving}
          />
          <p className="erp-hr-item-drawer-field-hint">
            {editingItem?.image
              ? t('hr.hints.replaceItemImage', { name: editingItem.image.name })
              : (editingItem?.images?.length ?? 0) > 0
                ? t('hr.hints.replaceItemImage', {
                    name: editingItem!.images![0]!.name,
                  })
                : t('hr.hints.itemImageOptional')}
          </p>
        </HrDrawerFormSection>
      </Form>
    </HrItemFormDrawer>
  );
}
