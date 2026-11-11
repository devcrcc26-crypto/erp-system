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
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { ShoppingCart } from 'lucide-react';
import dayjs from 'dayjs';
import HrFormItemsSection, {
  HrDrawerFormSection,
} from '@/components/modules/hr/shared/HrFormItemsSection';
import HrItemFormDrawer from '@/components/modules/hr/shared/HrItemFormDrawer';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import ProfileFileTypeIcon from '@/components/modules/users/ProfileFileTypeIcon';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPostForm } from '@/lib/api/client';
import type {
  AddPurchaseRequestItemPayload,
  PurchaseRequestDetail,
} from '@/lib/api/purchase-request.types';
import { useCreatePurchaseRequest, buildPurchaseRequestItemFormData } from '@/lib/query/purchase-request';
import { tokens } from '@/lib/theme/tokens';
import {
  formatEtbAmount,
  formatPurchaseItemDescription,
  formatPurchaseItemDescriptionInput,
  parsePurchaseItemDescription,
  PR_GM_THRESHOLD_ETB,
  requiresGmApproval,
} from '@/lib/utils/purchase-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatDisplayDate } from '@/lib/utils/date-format';

interface Step1Values {
  title?: string;
  justification?: string;
  requiredByDate?: dayjs.Dayjs | null;
  vendorName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
}

type ItemFormValues = Omit<
  AddPurchaseRequestItemPayload,
  'description' | 'modelSpec'
> & {
  descriptionWithModelSpec?: string;
};

interface ClientItem extends AddPurchaseRequestItemPayload {
  _key: string;
}

interface PurchaseRequestFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: PurchaseRequestDetail) => void;
}

const DETAILS_FIELDS = ['title', 'justification'] as const;

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/**
 * Purchase request create form - same StepperForm chrome as Add Employee.
 */
export default function PurchaseRequestForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: PurchaseRequestFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('PURCHASE_REQUEST');
  const messageApi = useAppMessage();
  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();
  const vendorName = Form.useWatch('vendorName', detailsForm);

  const [items, setItems] = useState<ClientItem[]>([]);
  const [detailsSnapshot, setDetailsSnapshot] = useState<Step1Values>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemImageFiles, setItemImageFiles] = useState<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreatePurchaseRequest();

  const totalEtb = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + Number(item.unitPrice) * Number(item.quantity),
        0,
      ),
    [items],
  );

  function itemLineEtb(item: ClientItem): number {
    return Number(item.unitPrice) * Number(item.quantity);
  }

  function resetForm(): void {
    onBehalf.reset();
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems([]);
    setDetailsSnapshot({});
    setEditingKey(null);
    setShowItemForm(false);
    setItemImageFiles([]);
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
      messageApi.warning(t('hr.validation.addPurchaseItem'));
      return false;
    }
    captureDetailsSnapshot();
    return true;
  }

  function openAddItem(): void {
    setEditingKey(null);
    itemForm.resetFields();
    setItemImageFiles([]);
    setShowItemForm(true);
  }

  function openEditItem(item: ClientItem): void {
    setEditingKey(item._key);
    itemForm.setFieldsValue({
      itemName: item.itemName,
      descriptionWithModelSpec: formatPurchaseItemDescriptionInput(
        item.description,
        item.modelSpec,
      ),
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
    });
    setItemImageFiles(item.files ?? []);
    setShowItemForm(true);
  }

  function cancelItemForm(): void {
    setShowItemForm(false);
    setEditingKey(null);
    itemForm.resetFields();
    setItemImageFiles([]);
  }

  async function saveItem(): Promise<void> {
    try {
      const values = await itemForm.validateFields();
      const { description, modelSpec } = parsePurchaseItemDescription(
        values.descriptionWithModelSpec,
      );
      const entry: ClientItem = {
        _key: editingKey ?? nextKey(),
        itemName: values.itemName,
        modelSpec,
        description,
        quantity: Number(values.quantity),
        unit: values.unit,
        unitPrice: Number(values.unitPrice),
        currency: 'ETB',
        files: itemImageFiles.length > 0 ? itemImageFiles : undefined,
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

    if (!values.title?.trim() || !values.justification?.trim()) {
      messageApi.warning(t('hr.validation.completePurchaseDetails'));
      return;
    }

    if (items.length === 0) {
      messageApi.warning(t('hr.validation.addPurchaseItem'));
      return;
    }

    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        ...onBehalf.payload,
        title: values.title.trim(),
        justification: values.justification.trim(),
        requiredByDate: values.requiredByDate
          ? values.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        vendorName: values.vendorName?.trim() || undefined,
        vendorEmail: values.vendorEmail?.trim() || undefined,
        vendorPhone: values.vendorPhone?.trim() || undefined,
      });

      await Promise.all(
        items.map((item) => {
          const { _key: _unused, ...payload } = item;
          return apiPostForm<PurchaseRequestDetail>(
            `/hr/purchase-requests/${created.id}/items`,
            buildPurchaseRequestItemFormData(payload),
          );
        }),
      );

      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const finalResult = await apiPostForm<PurchaseRequestDetail>(
        `/hr/purchase-requests/${created.id}/submit`,
        formData,
      );

      messageApi.success(t('hr.messages.purchaseRequestSubmitted'));
      onSuccess(finalResult);
    } catch (error: unknown) {
      const fallback = t('hr.messages.purchaseRequestSubmitFailed');
      const friendly = getFriendlyApiErrorMessage(error, fallback, t);
      notifyApiError(error, fallback, messageApi, t);
      setFormError(friendly);
    } finally {
      setSubmitting(false);
    }
  }

  const gmRequired = requiresGmApproval(totalEtb);

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: t('hr.table.descriptionWithModelSpec'),
      key: 'description',
      ellipsis: true,
      render: (_: unknown, row: ClientItem) =>
        formatPurchaseItemDescription(row.description, row.modelSpec),
    },
    {
      title: t('hr.table.itemImage'),
      key: 'image',
      width: 100,
      render: (_: unknown, row: ClientItem) => {
        const rowFiles = row.files ?? [];
        if (rowFiles.length === 0) {
          return '-';
        }
        const label = rowFiles.map((file) => file.name).join(', ');
        return (
          <Tooltip title={label}>
            <span className="inline-flex flex-wrap items-center gap-1">
              {rowFiles.slice(0, 3).map((file, index) => (
                <ProfileFileTypeIcon
                  key={`${file.name}-${file.size}-${index}`}
                  name={file.name}
                  fileType={file.type}
                  size="sm"
                />
              ))}
              {rowFiles.length > 3 ? (
                <span className="text-xs text-[var(--color-text-secondary)]">
                  +{rowFiles.length - 3}
                </span>
              ) : null}
            </span>
          </Tooltip>
        );
      },
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
      title: t('hr.table.unitPrice'),
      key: 'unitPrice',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) =>
        formatEtbAmount(row.unitPrice),
    },
    {
      title: t('hr.table.total'),
      key: 'totalEtb',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) => formatEtbAmount(itemLineEtb(row)),
    },
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

  const reviewItemColumns: ColumnsType<ClientItem> = itemColumns.filter(
    (column) => column.key !== 'actions',
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
              description={t('pages.hr.purchaseRequest.detailsStepDescription')}
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
                >
                  <Input.TextArea
                    rows={4}
                    maxLength={2000}
                    showCount
                    placeholder={t('hr.placeholder.enterJustification')}
                  />
                </Form.Item>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.items'),
        validate: () => validateItemsStep(),
        content: (
          <HrFormItemsSection
            titleId="purchase-request-items-title"
            title={t('hr.section.items')}
            count={items.length}
            headerExtra={
              <p className="m-0 px-4 pt-4 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {t('pages.hr.purchaseRequest.itemsStepDescription')}
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
              pagination={false}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<ShoppingCart size={28} strokeWidth={1.5} />}
                    title={t('hr.empty.noItems')}
                    description={t(
                      'pages.hr.purchaseRequest.itemsStepDescription',
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
                      <div className="flex flex-col items-stretch gap-1 px-1 text-sm font-medium sm:flex-row sm:justify-end sm:gap-4 sm:pr-2">
                        <span style={{ color: tokens.colorTextSecondary }}>
                          {t('hr.form.itemCount', { count: items.length })}
                        </span>
                        <span style={{ color: tokens.colorTextPrimary }}>
                          {t('hr.form.estimatedTotal')}:{' '}
                          <strong>{formatEtbAmount(totalEtb)}</strong>
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
            <ErpNotice
              tone={gmRequired ? 'warning' : 'success'}
              title={
                gmRequired
                  ? t('hr.messages.purchaseRequestGmRequired', {
                      amount: PR_GM_THRESHOLD_ETB.toLocaleString(),
                    })
                  : t('hr.messages.purchaseRequestHrSufficient', {
                      amount: PR_GM_THRESHOLD_ETB.toLocaleString(),
                    })
              }
              description={`${t('hr.form.estimatedTotal')}: ${formatEtbAmount(totalEtb)}`}
            />

            <FormLayout
              variant="pro"
              title={t('hr.form.reviewSubmit')}
              description={t('pages.hr.purchaseRequest.reviewStepDescription')}
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
                  label={t('hr.form.vendor')}
                  value={detailsSnapshot.vendorName?.trim() || '-'}
                />
                <ReviewItem
                  label={t('hr.form.estimatedTotal')}
                  value={formatEtbAmount(totalEtb)}
                />
                <ReviewItem
                  label={t('hr.form.justification')}
                  value={detailsSnapshot.justification?.trim() || '-'}
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
                footer={() => (
                  <div className="flex justify-end pr-2 text-sm font-medium">
                    <span style={{ color: tokens.colorTextPrimary }}>
                      {t('hr.form.estimatedTotal')}:{' '}
                      <strong>{formatEtbAmount(totalEtb)}</strong>
                    </span>
                  </div>
                )}
              />
            </FormLayout>

            <FormLayout
              variant="pro"
              title={t('hr.form.supportingDocuments')}
              description={t(
                'pages.hr.purchaseRequest.attachmentsStepDescription',
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
      detailsForm,
      vendorName,
      itemColumns,
      reviewItemColumns,
      items,
      totalEtb,
      gmRequired,
      detailsSnapshot,
      files,
    ],
  );

  const itemDrawerTitle = editingKey
    ? t('hr.form.editItem')
    : t('hr.form.newItem');
  const itemDrawerHint = editingKey
    ? t('hr.dialog.editPurchaseItemHint')
    : t('hr.dialog.addPurchaseItemHint');

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
        drawerClassName="erp-purchase-item-drawer"
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
              <Form.Item
                name="descriptionWithModelSpec"
                label={t('hr.form.descriptionWithModelSpec')}
                className="erp-hr-item-drawer-span-2"
              >
                <Input.TextArea
                  rows={2}
                  maxLength={1502}
                  showCount
                  placeholder={t(
                    'hr.placeholder.enterDescriptionWithModelSpec',
                  )}
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
                <InputNumber min={0.001} className="w-full" />
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
                name="unitPrice"
                label={t('hr.form.unitPrice')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.unitPriceRequired'),
                  },
                ]}
              >
                <InputNumber min={0} className="w-full" addonAfter="ETB" />
              </Form.Item>
            </div>
          </HrDrawerFormSection>
          <HrDrawerFormSection title={t('hr.form.itemImage')}>
            <FileUploadInput
              files={itemImageFiles}
              onChange={setItemImageFiles}
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              multiple
            />
            <p className="erp-hr-item-drawer-field-hint">
              {t('hr.hints.itemImageOptional')}
            </p>
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
