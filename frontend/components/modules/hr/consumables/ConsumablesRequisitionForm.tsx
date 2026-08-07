'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { apiPost } from '@/lib/api/client';
import type {
  AddConsumablesRequisitionItemPayload,
  ConsumablesRequisitionDetail,
} from '@/lib/api/consumables-requisition.types';
import { CONSUMABLES_MAX_ITEMS } from '@/lib/api/consumables-requisition.types';
import { useCreateConsumablesRequisition } from '@/lib/query/consumables-requisition';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

interface DetailsValues {
  title: string;
  purpose: string;
  requiredByDate?: dayjs.Dayjs | null;
  department?: string;
}

type ItemFormValues = Omit<
  AddConsumablesRequisitionItemPayload,
  'description' | 'itemCode'
> & {
  description?: string;
  itemCode?: string;
};

interface ClientItem extends AddConsumablesRequisitionItemPayload {
  _key: string;
}

interface ConsumablesRequisitionFormProps {
  onSuccess: (result: ConsumablesRequisitionDetail) => void;
}

let _keyCounter = 0;
function nextKey(): string {
  _keyCounter += 1;
  return `item-${_keyCounter}`;
}

/**
 * Single-page form for creating a Consumables Requisition.
 * createDraft → add items → submit (declaration required).
 */
export default function ConsumablesRequisitionForm({
  onSuccess,
}: ConsumablesRequisitionFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [detailsForm] = Form.useForm<DetailsValues>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const [items, setItems] = useState<ClientItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createMutation = useCreateConsumablesRequisition();

  function openAddItem(): void {
    if (items.length >= CONSUMABLES_MAX_ITEMS) {
      messageApi.warning(
        `Maximum ${CONSUMABLES_MAX_ITEMS} items per requisition`,
      );
      return;
    }
    setEditingKey(null);
    itemForm.resetFields();
    setShowItemForm(true);
  }

  function openEditItem(item: ClientItem): void {
    setEditingKey(item._key);
    itemForm.setFieldsValue({
      itemName: item.itemName,
      itemCode: item.itemCode ?? '',
      description: item.description ?? '',
      quantity: item.quantity,
      unit: item.unit,
    });
    setShowItemForm(true);
  }

  function cancelItemForm(): void {
    setShowItemForm(false);
    setEditingKey(null);
    itemForm.resetFields();
  }

  async function saveItem(): Promise<void> {
    try {
      const values = await itemForm.validateFields();
      const entry: ClientItem = {
        _key: editingKey ?? nextKey(),
        itemName: values.itemName,
        itemCode: values.itemCode || undefined,
        description: values.description || undefined,
        quantity: Number(values.quantity),
        unit: values.unit,
      };
      if (editingKey) {
        setItems((prev) =>
          prev.map((it) => (it._key === editingKey ? entry : it)),
        );
      } else {
        if (items.length >= CONSUMABLES_MAX_ITEMS) {
          messageApi.warning(
            `Maximum ${CONSUMABLES_MAX_ITEMS} items per requisition`,
          );
          return;
        }
        setItems((prev) => [...prev, entry]);
      }
      cancelItemForm();
    } catch {
      /* validation shown inline */
    }
  }

  function removeItem(key: string): void {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  async function handleSubmit(): Promise<void> {
    if (!declarationConfirmed) {
      messageApi.warning('Confirm the low-value consumables declaration');
      return;
    }
    if (items.length === 0) {
      messageApi.warning('Add at least one line item');
      return;
    }
    if (items.length > CONSUMABLES_MAX_ITEMS) {
      messageApi.warning(
        `Maximum ${CONSUMABLES_MAX_ITEMS} items per requisition`,
      );
      return;
    }

    let details: DetailsValues;
    try {
      details = await detailsForm.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        title: details.title.trim(),
        purpose: details.purpose.trim(),
        requiredByDate: details.requiredByDate
          ? details.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        department: details.department?.trim() || undefined,
        declarationConfirmed: true,
      });

      await Promise.all(
        items.map((item) => {
          const { _key: _unused, ...payload } = item;
          return apiPost<ConsumablesRequisitionDetail>(
            `/hr/consumables/${created.id}/items`,
            payload,
          );
        }),
      );

      const finalResult = await apiPost<ConsumablesRequisitionDetail>(
        `/hr/consumables/${created.id}/submit`,
      );

      messageApi.success(
        finalResult.directApproved ||
          (finalResult.status === 'APPROVED' && !finalResult.approvalRequestId)
          ? 'Consumables requisition approved'
          : 'Consumables requisition submitted for approval',
      );
      onSuccess(finalResult);
    } catch (error: unknown) {
      notifyApiError(
        error,
        'Failed to submit consumables requisition',
        messageApi,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.itemCode'),
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 110,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
    },
    { title: t('hr.table.unit'), dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, row: ClientItem) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditItem(row)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeItem(row._key)}
          />
        </Space>
      ),
    },
  ];

  const atMax = items.length >= CONSUMABLES_MAX_ITEMS;

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
      <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
        <Form form={detailsForm} layout="vertical">
          <Form.Item
            name="title"
            label={t('hr.form.title')}
            rules={[{ required: true, message: 'Enter a title' }]}
          >
            <Input
              placeholder={t('hr.placeholder.enterTitle')}
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            name="purpose"
            label={t('hr.form.purpose')}
            rules={[{ required: true, message: 'Provide a purpose' }]}
          >
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder={t('hr.placeholder.enterPurpose')}
            />
          </Form.Item>

          <Form.Item name="department" label={t('hr.form.department')}>
            <Input
              placeholder={t('hr.placeholder.enterDepartment')}
              maxLength={200}
            />
          </Form.Item>

          <Form.Item name="requiredByDate" label={t('hr.form.requiredByDate')}>
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={(d) => d.isBefore(dayjs(), 'day')}
            />
          </Form.Item>
        </Form>
      </SectionCard>

      <SectionCard
        title={t('hr.section.items')}
        bodyClassName="px-5 py-4"
        action={
          !showItemForm ? (
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              disabled={atMax}
              title={
                atMax
                  ? `Maximum ${CONSUMABLES_MAX_ITEMS} items per requisition`
                  : undefined
              }
              onClick={openAddItem}
            >
              {t('hr.buttons.addItem')}
            </Button>
          ) : undefined
        }
      >
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title="This form is for low-value consumable items only."
          description="Each item must be valued below ETB 5,000. For higher value items please use Material Requisition or Purchase Request instead."
        />

        <Typography.Text type="secondary" className="mb-3 block">
          {items.length} / {CONSUMABLES_MAX_ITEMS} items
        </Typography.Text>

        {showItemForm ? (
          <div
            className="mb-4 rounded-md p-4"
            style={{
              background: tokens.colorPageBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <Form form={itemForm} layout="vertical">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <Form.Item
                  name="itemName"
                  label={t('hr.form.itemName')}
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input maxLength={200} />
                </Form.Item>
                <Form.Item name="itemCode" label={t('hr.form.itemCode')}>
                  <Input placeholder={t('hr.placeholder.enterItemCode')} maxLength={100} />
                </Form.Item>
                <Form.Item
                  name="quantity"
                  label={t('hr.form.quantity')}
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <InputNumber min={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="unit"
                  label={t('hr.form.unit')}
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input placeholder="pcs, box, pack…" maxLength={50} />
                </Form.Item>
                <Form.Item
                  name="description"
                  label={t('hr.form.description')}
                  className="md:col-span-2"
                >
                  <Input maxLength={1000} />
                </Form.Item>
              </div>
              <Space>
                <Button type="primary" onClick={() => void saveItem()}>
                  {editingKey ? 'Update Item' : 'Add Item'}
                </Button>
                <Button onClick={cancelItemForm}>Cancel</Button>
              </Space>
            </Form>
          </div>
        ) : null}

        <Table<ClientItem>
          rowKey="_key"
          size="small"
          columns={itemColumns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: t('hr.empty.noItems') }}
        />
      </SectionCard>

      <div
        className="rounded-lg p-4"
        style={{
          background: tokens.colorPageBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <Checkbox
          checked={declarationConfirmed}
          onChange={(e) => setDeclarationConfirmed(e.target.checked)}
        >
          <span className="text-sm" style={{ color: tokens.colorTextPrimary }}>
            {t('hr.labels.declarationText')}
          </span>
        </Checkbox>
      </div>

      <div className="flex justify-end">
        <Button
          type="primary"
          loading={submitting}
          disabled={!declarationConfirmed || items.length === 0}
          onClick={() => void handleSubmit()}
        >
          {t('hr.buttons.submitRequest')}
        </Button>
      </div>
    </div>
  );
}
