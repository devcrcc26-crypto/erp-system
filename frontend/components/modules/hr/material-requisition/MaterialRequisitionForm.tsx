'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Space,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Inbox } from 'lucide-react';
import dayjs from 'dayjs';
import HrFormItemsSection, {
  HrDrawerFormSection,
} from '@/components/modules/hr/shared/HrFormItemsSection';
import HrItemFormDrawer from '@/components/modules/hr/shared/HrItemFormDrawer';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiDelete, apiPatch, apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AddMaterialRequisitionItemPayload,
  MaterialRequisitionDetail,
} from '@/lib/api/material-requisition.types';
import {
  useCreateMaterialRequisition,
  useUpdateMaterialRequisition,
} from '@/lib/query/material-requisition';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';

interface Step1Values {
  title?: string;
  purpose?: string;
  requiredByDate?: dayjs.Dayjs | null;
  warehouseLocation?: string;
}

type ItemFormValues = Omit<
  AddMaterialRequisitionItemPayload,
  'description' | 'itemCode'
> & {
  description?: string;
  itemCode?: string;
};

interface ClientItem extends AddMaterialRequisitionItemPayload {
  _key: string;
  /** Edit mode: id of the saved item this row came from. */
  serverId?: string;
}

interface MaterialRequisitionFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: MaterialRequisitionDetail) => void;
  /** Edit mode: the employee's own DRAFT / RETURNED requisition, prefilled. */
  initialRecord?: MaterialRequisitionDetail;
}

const ITEMS_PATH = (requisitionId: string): string =>
  `/hr/material-requisition/${requisitionId}/items`;

const DETAILS_FIELDS = ['title', 'purpose'] as const;

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

function detailsFrom(record: MaterialRequisitionDetail): Step1Values {
  return {
    title: record.title,
    purpose: record.purpose,
    requiredByDate: record.requiredByDate ? dayjs(record.requiredByDate) : null,
    warehouseLocation: record.warehouseLocation ?? undefined,
  };
}

function clientItemsFrom(record: MaterialRequisitionDetail): ClientItem[] {
  return record.items.map((item) => ({
    _key: nextKey(),
    serverId: item.id,
    itemName: item.itemName,
    itemCode: item.itemCode ?? undefined,
    description: item.description ?? undefined,
    quantity: Number(item.quantity),
    unit: item.unit,
  }));
}

/**
 * Material requisition create form - same StepperForm chrome as Add Employee.
 */
export default function MaterialRequisitionForm({
  onSuccess,
  initialRecord,
  onCancel,
  cancelLabel,
}: MaterialRequisitionFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('MATERIAL_REQUISITION');
  const messageApi = useAppMessage();
  const initialDetails = useMemo<Step1Values>(
    () => (initialRecord ? detailsFrom(initialRecord) : {}),
    [initialRecord],
  );
  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();
  const [items, setItems] = useState<ClientItem[]>(() =>
    initialRecord ? clientItemsFrom(initialRecord) : [],
  );
  const [detailsSnapshot, setDetailsSnapshot] =
    useState<Step1Values>(initialDetails);
  const updateMutation = useUpdateMaterialRequisition(initialRecord?.id ?? '');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateMaterialRequisition();

  function resetForm(): void {
    onBehalf.reset();
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems(initialRecord ? clientItemsFrom(initialRecord) : []);
    setDetailsSnapshot(initialDetails);
    setEditingKey(null);
    setShowItemForm(false);
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
      messageApi.warning(t('hr.validation.addMaterialItem'));
      return false;
    }
    captureDetailsSnapshot();
    return true;
  }

  function openAddItem(): void {
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
        serverId: items.find((row) => row._key === editingKey)?.serverId,
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

    const values = {
      ...detailsSnapshot,
      ...detailsForm.getFieldsValue(true),
    };

    if (!values.title?.trim() || !values.purpose?.trim()) {
      messageApi.warning(t('hr.validation.completeMaterialDetails'));
      return;
    }

    if (items.length === 0) {
      messageApi.warning(t('hr.validation.addMaterialItem'));
      return;
    }

    setSubmitting(true);
    if (initialRecord) {
      try {
        // Sync items (allowed while DRAFT / RETURNED), then the header.
        const keptIds = new Set(
          items.map((row) => row.serverId).filter(Boolean),
        );
        for (const saved of initialRecord.items) {
          if (!keptIds.has(saved.id)) {
            await apiDelete(`${ITEMS_PATH(initialRecord.id)}/${saved.id}`);
          }
        }
        for (const item of items) {
          const { _key: _unused, serverId, ...payload } = item;
          if (serverId) {
            await apiPatch(`${ITEMS_PATH(initialRecord.id)}/${serverId}`, payload);
          } else {
            await apiPost(ITEMS_PATH(initialRecord.id), payload);
          }
        }
        const saved = await updateMutation.mutateAsync({
          title: values.title.trim(),
          purpose: values.purpose.trim(),
          requiredByDate: values.requiredByDate
            ? values.requiredByDate.format('YYYY-MM-DD')
            : undefined,
          warehouseLocation: values.warehouseLocation?.trim() || undefined,
        });
        messageApi.success(t('pages.approvals.edit.saved'));
        onSuccess(saved);
      } catch (error: unknown) {
        const fallback = t('pages.approvals.edit.failed');
        notifyApiError(error, fallback, messageApi, t);
        setFormError(getFriendlyApiErrorMessage(error, fallback, t));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        ...onBehalf.payload,
        title: values.title.trim(),
        purpose: values.purpose.trim(),
        requiredByDate: values.requiredByDate
          ? values.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        warehouseLocation: values.warehouseLocation?.trim() || undefined,
      });

      await Promise.all(
        items.map((item) => {
          const { _key: _unused, ...payload } = item;
          return apiPost<MaterialRequisitionDetail>(
            `/hr/material-requisition/${created.id}/items`,
            payload,
          );
        }),
      );

      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const finalResult = await apiPostForm<MaterialRequisitionDetail>(
        `/hr/material-requisition/${created.id}/submit`,
        formData,
      );

      messageApi.success(t('hr.messages.materialRequisitionSubmitted'));
      onSuccess(finalResult);
    } catch (error: unknown) {
      const fallback = t('hr.messages.materialRequisitionSubmitFailed');
      const friendly = getFriendlyApiErrorMessage(error, fallback, t);
      notifyApiError(error, fallback, messageApi, t);
      setFormError(friendly);
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
      render: (value: string | undefined) => value || '-',
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string | undefined) => value || '-',
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
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeItem(row._key)}
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
          <div className="flex flex-col gap-4">
            {initialRecord ? null : <OnBehalfSection state={onBehalf} />}
            <FormLayout
              variant="pro"
              title={t('hr.section.requestDetails')}
              description={t(
                'pages.hr.materialRequisition.detailsStepDescription',
              )}
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
                  rows={4}
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

                <Form.Item
                  name="warehouseLocation"
                  label={t('hr.form.warehouseLocation')}
                >
                  <Input
                    placeholder={t('hr.placeholder.enterWarehouseLocation')}
                    maxLength={200}
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
          <HrFormItemsSection
            titleId="material-requisition-items-title"
            title={t('hr.section.items')}
            count={items.length}
            headerExtra={
              <p className="m-0 px-4 pt-4 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {t('pages.hr.materialRequisition.itemsStepDescription')}
              </p>
            }
            addButton={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openAddItem}
              >
                {t('hr.buttons.addItem')}
              </Button>
            }
          >
            <Table<ClientItem>
              rowKey="_key"
              size="middle"
              tableLayout="fixed"
              className="erp-pro-table erp-users-table"
              columns={itemColumns}
              dataSource={items}
              scroll={{ x: 'max-content' }}
              pagination={false}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<Inbox size={28} strokeWidth={1.5} />}
                    title={t('hr.empty.noItems')}
                    description={t(
                      'pages.hr.materialRequisition.itemsStepDescription',
                    )}
                    action={{
                      label: t('hr.buttons.addItem'),
                      onClick: openAddItem,
                    }}
                  />
                ),
              }}
              footer={
                items.length > 0
                  ? () => (
                      <div className="flex justify-end px-1 text-sm font-medium sm:pr-2">
                        <span style={{ color: tokens.colorTextSecondary }}>
                          {t('hr.form.itemCount', { count: items.length })}
                        </span>
                      </div>
                    )
                  : undefined
              }
            />
          </HrFormItemsSection>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="flex flex-col gap-4">
            <FormLayout
              variant="pro"
              title={t('hr.form.reviewSubmit')}
              description={t(
                'pages.hr.materialRequisition.reviewStepDescription',
              )}
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
                  label={t('hr.form.warehouseLocation')}
                  value={detailsSnapshot.warehouseLocation?.trim() || '-'}
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
              <Table<ClientItem>
                rowKey="_key"
                size="small"
                columns={reviewItemColumns}
                dataSource={items}
                scroll={{ x: 'max-content' }}
                pagination={false}
                locale={{ emptyText: t('hr.empty.noItems') }}
              />
            </FormLayout>

            {initialRecord ? null : (
              // Edit saves are JSON; supporting documents stay as submitted.
              <FormLayout
                variant="pro"
                title={t('hr.form.supportingDocuments')}
                description={t(
                  'pages.hr.materialRequisition.attachmentsStepDescription',
                )}
              >
                <FileUploadInput
                  files={files}
                  onChange={setFiles}
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg"
                  placeholder={t(
                    'hr.placeholder.chooseSupportingDocuments',
                  )}
                />
              </FormLayout>
            )}
          </div>
        ),
      },
    ],
    [
      initialRecord,
      onBehalf,
      t,
      itemColumns,
      reviewItemColumns,
      items,
      detailsSnapshot,
      files,
    ],
  );

  const itemDrawerTitle = editingKey
    ? t('hr.form.editItem')
    : t('hr.form.newItem');
  const itemDrawerHint = editingKey
    ? t('hr.dialog.editMaterialItemHint')
    : t('hr.dialog.addMaterialItemHint');

  return (
    <Form<Step1Values>
      form={detailsForm}
      layout="vertical"
      requiredMark={false}
      preserve
      initialValues={initialDetails}
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
        submitLabel={
          initialRecord
            ? t('pages.approvals.edit.saveChanges')
            : t('hr.buttons.submitRequest')
        }
      />
      <HrItemFormDrawer
        open={showItemForm}
        onClose={cancelItemForm}
        editing={Boolean(editingKey)}
        title={itemDrawerTitle}
        hint={itemDrawerHint}
        onSave={saveItem}
        drawerClassName="erp-material-item-drawer"
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
