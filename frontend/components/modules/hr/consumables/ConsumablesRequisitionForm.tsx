'use client';

import { useMemo, useState } from 'react';
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
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPost } from '@/lib/api/client';
import type {
  AddConsumablesRequisitionItemPayload,
  ConsumablesRequisitionDetail,
} from '@/lib/api/consumables-requisition.types';
import { CONSUMABLES_MAX_ITEMS } from '@/lib/api/consumables-requisition.types';
import { useCreateConsumablesRequisition } from '@/lib/query/consumables-requisition';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface Step1Values {
  title?: string;
  purpose?: string;
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

const DETAILS_FIELDS = ['title', 'purpose'] as const;

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/**
 * Consumables requisition create form — same StepperForm chrome as Add Employee.
 */
export default function ConsumablesRequisitionForm({
  onSuccess,
}: ConsumablesRequisitionFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const [items, setItems] = useState<ClientItem[]>([]);
  const [detailsSnapshot, setDetailsSnapshot] = useState<Step1Values>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateConsumablesRequisition();
  const atMax = items.length >= CONSUMABLES_MAX_ITEMS;

  function resetForm(): void {
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems([]);
    setDetailsSnapshot({});
    setEditingKey(null);
    setShowItemForm(false);
    setDeclarationConfirmed(false);
    setFormError(null);
  }

  function captureDetailsSnapshot(): Step1Values {
    const values = detailsForm.getFieldsValue(true);
    setDetailsSnapshot(values);
    return values;
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await detailsForm.validateFields([...DETAILS_FIELDS]);
      captureDetailsSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validateItemsStep(): Promise<boolean> {
    if (items.length === 0) {
      messageApi.warning(t('hr.validation.addConsumablesItem'));
      return false;
    }
    captureDetailsSnapshot();
    return true;
  }

  function openAddItem(): void {
    if (atMax) {
      messageApi.warning(
        t('hr.validation.consumablesMaxItems', {
          count: CONSUMABLES_MAX_ITEMS,
        }),
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
          prev.map((row) => (row._key === editingKey ? entry : row)),
        );
      } else {
        if (items.length >= CONSUMABLES_MAX_ITEMS) {
          messageApi.warning(
            t('hr.validation.consumablesMaxItems', {
              count: CONSUMABLES_MAX_ITEMS,
            }),
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
    setItems((prev) => prev.filter((row) => row._key !== key));
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);

    if (!declarationConfirmed) {
      messageApi.warning(t('hr.validation.consumablesDeclarationRequired'));
      return;
    }

    const values = {
      ...detailsSnapshot,
      ...detailsForm.getFieldsValue(true),
    };

    if (!values.title?.trim() || !values.purpose?.trim()) {
      messageApi.warning(t('hr.validation.completeConsumablesDetails'));
      return;
    }

    if (items.length === 0) {
      messageApi.warning(t('hr.validation.addConsumablesItem'));
      return;
    }

    if (items.length > CONSUMABLES_MAX_ITEMS) {
      messageApi.warning(
        t('hr.validation.consumablesMaxItems', {
          count: CONSUMABLES_MAX_ITEMS,
        }),
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        title: values.title.trim(),
        purpose: values.purpose.trim(),
        requiredByDate: values.requiredByDate
          ? values.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        department: values.department?.trim() || undefined,
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

      const isDirectApproved =
        finalResult.directApproved ||
        (finalResult.status === 'APPROVED' && !finalResult.approvalRequestId);

      messageApi.success(
        isDirectApproved
          ? t('hr.messages.consumablesRequisitionApproved')
          : t('hr.messages.consumablesRequisitionSubmitted'),
      );
      onSuccess(finalResult);
    } catch (error: unknown) {
      const message = t('hr.messages.consumablesRequisitionSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(message);
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
      render: (value: string | undefined) => value || '—',
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string | undefined) => value || '—',
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
      width: 80,
      render: (_: unknown, row: ClientItem) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEditItem(row)}
            style={{ borderRadius: 0 }}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeItem(row._key)}
            style={{ borderRadius: 0 }}
          />
        </Space>
      ),
    },
  ];

  const reviewItemColumns = itemColumns.filter(
    (column) => column.key !== 'actions',
  );

  const steps = useMemo(
    () => [
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.requestDetails')}
            description={t('pages.hr.consumables.detailsStepDescription')}
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

            <Form.Item
              name="purpose"
              label={t('hr.labels.purpose')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.purposeRequired'),
                },
              ]}
            >
              <Input.TextArea
                rows={3}
                maxLength={2000}
                showCount
                placeholder={t('hr.placeholder.enterPurpose')}
              />
            </Form.Item>

            <div className="erp-form-grid-2">
              <Form.Item name="department" label={t('hr.form.department')}>
                <Input
                  placeholder={t('hr.placeholder.enterDepartment')}
                  maxLength={200}
                />
              </Form.Item>

              <Form.Item
                name="requiredByDate"
                label={t('hr.form.requiredByDate')}
              >
                <DatePicker
                  className="w-full"
                  disabledDate={(date) => date.isBefore(dayjs(), 'day')}
                />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.section.items'),
        validate: () => validateItemsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.items')}
            description={t('pages.hr.consumables.itemsStepDescription')}
            extra={
              !showItemForm ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={atMax}
                  title={
                    atMax
                      ? t('hr.validation.consumablesMaxItems', {
                          count: CONSUMABLES_MAX_ITEMS,
                        })
                      : undefined
                  }
                  onClick={openAddItem}
                  style={{ borderRadius: 0 }}
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
              title={t('hr.messages.consumablesLowValueOnly')}
              description={t('hr.messages.consumablesLowValueOnlyDesc')}
            />

            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginBottom: 12 }}
            >
              {t('hr.form.itemCount', { count: items.length })} /{' '}
              {CONSUMABLES_MAX_ITEMS}
            </Typography.Text>

            <div
              className={
                showItemForm
                  ? 'mb-4 rounded-none border border-[rgba(0,0,0,0.08)] p-4'
                  : 'hidden'
              }
              style={
                showItemForm ? { background: tokens.colorPageBg } : undefined
              }
              aria-hidden={!showItemForm}
            >
              <Typography.Text
                strong
                style={{ display: 'block', marginBottom: 12 }}
              >
                {editingKey ? t('hr.form.editItem') : t('hr.form.newItem')}
              </Typography.Text>
              <Form
                form={itemForm}
                layout="vertical"
                requiredMark={false}
                component={false}
              >
                <div className="erp-form-grid-2">
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
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item name="itemCode" label={t('hr.form.itemCode')}>
                    <Input
                      placeholder={t('hr.placeholder.enterItemCode')}
                      maxLength={100}
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
                    <InputNumber min={0.01} className="w-full" />
                  </Form.Item>
                  <Form.Item
                    name="unit"
                    label={t('hr.form.unit')}
                    rules={[
                      {
                        required: true,
                        message: t('hr.validation.unitRequired'),
                      },
                    ]}
                  >
                    <Input
                      placeholder={t('hr.placeholder.enterUnit')}
                      maxLength={50}
                    />
                  </Form.Item>
                  <Form.Item
                    name="description"
                    label={t('hr.form.description')}
                    className="sm:col-span-2"
                  >
                    <Input.TextArea rows={3} maxLength={1000} showCount />
                  </Form.Item>
                </div>
              </Form>
              <div className="flex justify-end gap-2">
                <Button onClick={cancelItemForm} style={{ borderRadius: 0 }}>
                  {t('hr.buttons.cancel')}
                </Button>
                <Button
                  type="primary"
                  onClick={() => void saveItem()}
                  style={{ borderRadius: 0 }}
                >
                  {editingKey ? t('common.save') : t('hr.buttons.addItem')}
                </Button>
              </div>
            </div>

            <Table<ClientItem>
              rowKey="_key"
              size="small"
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              locale={{ emptyText: t('hr.empty.noItems') }}
            />
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="flex flex-col gap-4">
            <FormLayout
              variant="pro"
              title={t('hr.form.reviewSubmit')}
              description={t('pages.hr.consumables.reviewStepDescription')}
            >
              <div className="erp-form-grid-2">
                <ReviewItem
                  label={t('hr.form.title')}
                  value={detailsSnapshot.title?.trim() || '—'}
                />
                <ReviewItem
                  label={t('hr.section.items')}
                  value={t('hr.form.itemCount', { count: items.length })}
                />
                <ReviewItem
                  label={t('hr.form.requiredByDate')}
                  value={
                    detailsSnapshot.requiredByDate
                      ? formatDisplayDate(
                          detailsSnapshot.requiredByDate.format('YYYY-MM-DD'),
                        )
                      : '—'
                  }
                />
                <ReviewItem
                  label={t('hr.form.department')}
                  value={detailsSnapshot.department?.trim() || '—'}
                />
                <ReviewItem
                  label={t('hr.labels.purpose')}
                  value={detailsSnapshot.purpose?.trim() || '—'}
                />
              </div>
            </FormLayout>

            <FormLayout
              variant="pro"
              title={t('hr.section.items')}
              description={t('hr.form.itemCount', { count: items.length })}
            >
              <Table<ClientItem>
                rowKey="_key"
                size="small"
                columns={reviewItemColumns}
                dataSource={items}
                pagination={false}
                locale={{ emptyText: t('hr.empty.noItems') }}
              />
            </FormLayout>

            <FormLayout
              variant="pro"
              title={t('hr.form.declarationLabel')}
              description={t('pages.hr.consumables.declarationStepDescription')}
            >
              <Checkbox
                checked={declarationConfirmed}
                onChange={(event) =>
                  setDeclarationConfirmed(event.target.checked)
                }
              >
                <span
                  className="text-sm"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {t('hr.labels.declarationText')}
                </span>
              </Checkbox>
            </FormLayout>
          </div>
        ),
      },
    ],
    [
      t,
      showItemForm,
      editingKey,
      itemForm,
      itemColumns,
      reviewItemColumns,
      items,
      atMax,
      detailsSnapshot,
      declarationConfirmed,
    ],
  );

  return (
    <Form<Step1Values>
      form={detailsForm}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
    >
      {formError ? (
        <Alert
          type="error"
          showIcon
          title={formError}
          className="mb-4"
          closable
          onClose={() => setFormError(null)}
        />
      ) : null}
      <StepperForm
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={submitting}
        contentVariant="sections"
        submitLabel={t('hr.buttons.submitRequest')}
      />
    </Form>
  );
}

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-0.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 whitespace-pre-wrap text-sm"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}
