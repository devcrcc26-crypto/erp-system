'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Form,
  Grid,
  Input,
  InputNumber,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { Pencil, ShoppingBag, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import HrFormItemsSection, {
  HrDrawerFormSection,
} from '@/components/modules/hr/shared/HrFormItemsSection';
import HrItemFormDrawer from '@/components/modules/hr/shared/HrItemFormDrawer';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AddConsumablesRequisitionItemPayload,
  ConsumablesRequisitionDetail,
} from '@/lib/api/consumables-requisition.types';
import { CONSUMABLES_MAX_ITEMS } from '@/lib/api/consumables-requisition.types';
import { useCreateConsumablesRequisition } from '@/lib/query/consumables-requisition';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

interface Step1Values {
  title?: string;
  purpose?: string;
  requiredByDate?: dayjs.Dayjs | null;
}

type ItemFormValues = Omit<
  AddConsumablesRequisitionItemPayload,
  'description' | 'itemCode' | 'modelSpec'
> & {
  description?: string;
  itemCode?: string;
  modelSpec?: string;
};

interface ClientItem extends AddConsumablesRequisitionItemPayload {
  _key: string;
}

interface ConsumablesRequisitionFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: ConsumablesRequisitionDetail) => void;
}

const DETAILS_FIELDS = ['title', 'purpose'] as const;

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/**
 * Consumables requisition create form - same StepperForm chrome as Add Employee.
 */
export default function ConsumablesRequisitionForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: ConsumablesRequisitionFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('CONSUMABLES_REQUISITION');
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const isCompact = screens.md === false;
  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const [items, setItems] = useState<ClientItem[]>([]);
  const [detailsSnapshot, setDetailsSnapshot] = useState<Step1Values>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateConsumablesRequisition();
  const atMax = items.length >= CONSUMABLES_MAX_ITEMS;

  function resetForm(): void {
    onBehalf.reset();
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems([]);
    setDetailsSnapshot({});
    setEditingKey(null);
    setShowItemForm(false);
    setDeclarationConfirmed(false);
    setFiles([]);
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
      modelSpec: item.modelSpec ?? '',
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
      const quantity = Number(values.quantity);
      const entry: ClientItem = {
        _key: editingKey ?? nextKey(),
        itemName: values.itemName,
        itemCode: values.itemCode || undefined,
        modelSpec: values.modelSpec || undefined,
        description: values.description || undefined,
        quantity,
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
        ...onBehalf.payload,
        title: values.title.trim(),
        purpose: values.purpose.trim(),
        requiredByDate: values.requiredByDate
          ? values.requiredByDate.format('YYYY-MM-DD')
          : undefined,
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

      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      const finalResult = await apiPostForm<ConsumablesRequisitionDetail>(
        `/hr/consumables/${created.id}/submit`,
        formData,
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
      const fallback = t('hr.messages.consumablesRequisitionSubmitFailed');
      const friendly = getFriendlyApiErrorMessage(error, fallback, t);
      notifyApiError(error, fallback, messageApi, t);
      setFormError(friendly);
    } finally {
      setSubmitting(false);
    }
  }

  const tableScrollX = isNarrow ? 480 : isCompact ? 640 : 800;

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: t('hr.table.itemName'),
      key: 'itemName',
      ellipsis: true,
      render: (_: unknown, row: ClientItem) => (
        <div className="min-w-0">
          <span className="erp-users-cell-strong">{row.itemName}</span>
          <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
            {[row.itemCode, `${row.quantity} ${row.unit}`.trim()]
              .filter(Boolean)
              .join(' · ') || '-'}
          </p>
        </div>
      ),
    },
    {
      title: t('hr.table.itemCode'),
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 110,
      responsive: ['md'],
      render: (value: string | undefined) => (
        <span className="erp-users-cell-sub">{value || '-'}</span>
      ),
    },
    {
      title: t('hr.form.modelSpec'),
      dataIndex: 'modelSpec',
      key: 'modelSpec',
      width: 120,
      ellipsis: true,
      responsive: ['lg'],
      render: (value: string | undefined) => (
        <span className="erp-users-cell-sub">{value || '-'}</span>
      ),
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      responsive: ['xl'],
      render: (value: string | undefined) => (
        <span className="erp-users-cell-sub">{value || '-'}</span>
      ),
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: isNarrow ? 64 : 80,
      align: 'right',
      render: (value: number) => (
        <span className="erp-users-cell-sub tabular-nums">{value}</span>
      ),
    },
    {
      title: t('hr.table.unit'),
      dataIndex: 'unit',
      key: 'unit',
      width: 72,
      responsive: ['sm'],
      render: (value: string) => (
        <span className="erp-users-cell-sub">{value}</span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 72,
      fixed: isCompact ? ('right' as const) : undefined,
      render: (_: unknown, row: ClientItem) => (
        <div
          className="erp-table-row-actions flex items-center justify-end gap-0.5"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Tooltip title={t('common.update')}>
            <Button
              size="small"
              type="text"
              icon={<Pencil size={14} />}
              onClick={() => openEditItem(row)}
              aria-label={t('common.update')}
            />
          </Tooltip>
          <Tooltip title={t('common.delete')}>
            <Button
              size="small"
              type="text"
              danger
              icon={<Trash2 size={14} />}
              onClick={() => removeItem(row._key)}
              aria-label={t('common.delete')}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  const reviewItemColumns = itemColumns.filter(
    (column) => column.key !== 'actions',
  );

  const itemsEmpty = (
    <TableEmptyState
      icon={<ShoppingBag size={28} strokeWidth={1.5} />}
      title={t('hr.empty.noItems')}
      description={t('pages.hr.consumables.itemsStepDescription')}
    />
  );

  const steps = useMemo(
    () => [
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
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
          </div>
        ),
      },
      {
        title: t('hr.section.items'),
        validate: () => validateItemsStep(),
        content: (
          <div className="flex flex-col gap-4">
            <ErpNotice
              tone="warning"
              title={t('hr.messages.consumablesLowValueOnly')}
              description={t('hr.messages.consumablesLowValueOnlyDesc')}
            />
            <HrFormItemsSection
              titleId="consumables-requisition-items-title"
              title={t('hr.section.items')}
              count={items.length}
              headerExtra={
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
                  <Typography.Text type="secondary" className="text-sm">
                    {t('hr.form.itemCount', { count: items.length })} /{' '}
                    {CONSUMABLES_MAX_ITEMS}
                  </Typography.Text>
                </div>
              }
              addButton={
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
                >
                  {t('hr.buttons.addItem')}
                </Button>
              }
            >
              <div className="erp-table-scroll min-w-0 w-full overflow-x-auto overflow-y-clip">
                <Table<ClientItem>
                  rowKey="_key"
                  size="middle"
                  tableLayout="fixed"
                  className="erp-data-table erp-pro-table erp-users-table"
                  columns={itemColumns}
                  dataSource={items}
                  pagination={false}
                  locale={{
                    emptyText: (
                      <TableEmptyState
                        icon={<ShoppingBag size={28} strokeWidth={1.5} />}
                        title={t('hr.empty.noItems')}
                        description={t(
                          'pages.hr.consumables.itemsStepDescription',
                        )}
                        action={
                          atMax
                            ? undefined
                            : {
                                label: t('hr.buttons.addItem'),
                                onClick: openAddItem,
                              }
                        }
                      />
                    ),
                  }}
                  scroll={{ x: tableScrollX }}
                  footer={
                    items.length > 0
                      ? () => (
                          <div className="flex flex-wrap items-center justify-end gap-2 px-1 text-sm sm:pr-2">
                            <span className="erp-users-cell-sub">
                              {t('hr.form.itemCount', { count: items.length })}
                            </span>
                          </div>
                        )
                      : undefined
                  }
                />
              </div>
            </HrFormItemsSection>
          </div>
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
                  value={detailsSnapshot.title?.trim() || '-'}
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
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.labels.purpose')}
                  value={detailsSnapshot.purpose?.trim() || '-'}
                />
              </div>
            </FormLayout>

            <FormLayout
              variant="pro"
              title={t('hr.section.items')}
              description={t('hr.form.itemCount', { count: items.length })}
            >
              <div className="erp-table-scroll min-w-0 w-full overflow-x-auto overflow-y-clip">
                <Table<ClientItem>
                  rowKey="_key"
                  size="small"
                  className="erp-data-table erp-pro-table erp-users-table"
                  columns={reviewItemColumns}
                  dataSource={items}
                  pagination={false}
                  locale={{ emptyText: itemsEmpty }}
                  scroll={{ x: tableScrollX }}
                  footer={
                    items.length > 0
                      ? () => (
                          <div className="flex flex-wrap items-center justify-end gap-2 px-1 text-sm sm:pr-2">
                            <span className="erp-users-cell-sub">
                              {t('hr.form.itemCount', { count: items.length })}
                            </span>
                          </div>
                        )
                      : undefined
                  }
                />
              </div>
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

            <FormLayout
              variant="pro"
              title={t('hr.form.supportingDocuments')}
              description={t(
                'pages.hr.consumables.attachmentsStepDescription',
              )}
            >
              <FileUploadInput
                files={files}
                onChange={setFiles}
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                placeholder={t('hr.placeholder.chooseSupportingDocuments')}
              />
            </FormLayout>
          </div>
        ),
      },
    ],
    [
      onBehalf,
      t,
      itemColumns,
      reviewItemColumns,
      items,
      atMax,
      detailsSnapshot,
      declarationConfirmed,
      files,
      tableScrollX,
      isNarrow,
      isCompact,
    ],
  );

  const itemDrawerTitle = editingKey
    ? t('hr.form.editItem')
    : t('hr.form.newItem');
  const itemDrawerHint = editingKey
    ? t('hr.dialog.editConsumablesItemHint')
    : t('hr.dialog.addConsumablesItemHint');

  return (
    <Form<Step1Values>
      form={detailsForm}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
    >
      {formError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={formError}
          closable
          closeLabel={t('errors.dismiss')}
          onClose={() => setFormError(null)}
        />
      ) : null}
      <StepperForm
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={submitting}
        contentVariant="sections"
        submitLabel={t('hr.buttons.submitRequest')}
      />
      <HrItemFormDrawer
        open={showItemForm}
        onClose={cancelItemForm}
        editing={Boolean(editingKey)}
        title={itemDrawerTitle}
        hint={itemDrawerHint}
        onSave={saveItem}
        drawerClassName="erp-consumables-item-drawer"
      >
        <Form
          form={itemForm}
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
                name="modelSpec"
                label={t('hr.form.modelSpec')}
                className="erp-hr-item-drawer-span-2"
              >
                <Input.TextArea
                  rows={3}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder={t('hr.placeholder.enterModelSpec')}
                  maxLength={500}
                  showCount
                />
              </Form.Item>
              <Form.Item
                name="description"
                label={t('hr.form.description')}
                className="erp-hr-item-drawer-span-2"
              >
                <Input.TextArea rows={3} maxLength={1000} showCount />
              </Form.Item>
            </div>
          </HrDrawerFormSection>
        </Form>
      </HrItemFormDrawer>
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
