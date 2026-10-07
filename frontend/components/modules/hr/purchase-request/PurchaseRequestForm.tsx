'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
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
  SupportedCurrency,
} from '@/lib/api/purchase-request.types';
import { useCreatePurchaseRequest, buildPurchaseRequestItemFormData } from '@/lib/query/purchase-request';
import { useCurrencyRates } from '@/lib/query/currency';
import { tokens } from '@/lib/theme/tokens';
import {
  formatCurrencyAmount,
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
  vendorContact?: string;
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
  onSuccess: (result: PurchaseRequestDetail) => void;
}

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'ETB', label: 'ETB' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
];

const DETAILS_FIELDS = ['title', 'justification'] as const;

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/**
 * Purchase request create form — same StepperForm chrome as Add Employee.
 */
export default function PurchaseRequestForm({
  onSuccess,
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
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ratesQuery = useCurrencyRates();
  const createMutation = useCreatePurchaseRequest();

  function getRate(currency: SupportedCurrency): number {
    if (currency === 'ETB') {
      return 1;
    }
    return ratesQuery.data?.[currency] ?? 1;
  }

  const totalEtb = useMemo(
    () =>
      items.reduce((sum, item) => {
        const line = Number(item.unitPrice) * Number(item.quantity);
        return sum + line * getRate(item.currency);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, ratesQuery.data],
  );

  function itemLineEtb(item: ClientItem): number {
    return (
      Number(item.unitPrice) * Number(item.quantity) * getRate(item.currency)
    );
  }

  function resetForm(): void {
    onBehalf.reset();
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems([]);
    setDetailsSnapshot({});
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
      messageApi.warning(t('hr.validation.addPurchaseItem'));
      return false;
    }
    captureDetailsSnapshot();
    return true;
  }

  function openAddItem(): void {
    setEditingKey(null);
    itemForm.resetFields();
    itemForm.setFieldValue('currency', 'ETB');
    setItemImageFile(null);
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
      currency: item.currency,
    });
    setItemImageFile(item.file ?? null);
    setShowItemForm(true);
  }

  function cancelItemForm(): void {
    setShowItemForm(false);
    setEditingKey(null);
    itemForm.resetFields();
    setItemImageFile(null);
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
        currency: values.currency,
        file: itemImageFile ?? undefined,
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
        vendorContact: values.vendorContact?.trim() || undefined,
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
      render: (_: unknown, row: ClientItem) =>
        row.file ? (
          <Tooltip title={row.file.name}>
            <span className="inline-flex">
              <ProfileFileTypeIcon
                name={row.file.name}
                fileType={row.file.type}
                size="sm"
              />
            </span>
          </Tooltip>
        ) : (
          '—'
        ),
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
        formatCurrencyAmount(row.unitPrice, row.currency),
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
                    <Form.Item
                      name="vendorContact"
                      label={t('hr.form.vendorContact')}
                    >
                      <Input
                        placeholder={t('hr.placeholder.enterVendorContact')}
                        maxLength={200}
                      />
                    </Form.Item>
                  ) : null}
                </div>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.items'),
        validate: () => validateItemsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.items')}
            description={t('pages.hr.purchaseRequest.itemsStepDescription')}
            extra={
              !showItemForm ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openAddItem}
                >
                  {t('hr.buttons.addItem')}
                </Button>
              ) : undefined
            }
          >
            <div
              className={
                showItemForm
                  ? 'mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4'
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
                  {editingKey
                    ? t('hr.form.editItem')
                    : t('hr.form.newItem')}
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
                    <Form.Item
                      name="descriptionWithModelSpec"
                      label={t('hr.form.descriptionWithModelSpec')}
                      className="sm:col-span-2"
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
                      <InputNumber min={0} className="w-full" />
                    </Form.Item>
                    <Form.Item
                      name="currency"
                      label={t('hr.form.currency')}
                      initialValue="ETB"
                      rules={[{ required: true }]}
                    >
                      <Select options={CURRENCY_OPTIONS} />
                    </Form.Item>
                    <Form.Item
                      label={t('hr.form.itemImage')}
                      className="sm:col-span-2"
                      extra={t('hr.hints.itemImageOptional')}
                    >
                      <FileUploadInput
                        files={itemImageFile ? [itemImageFile] : []}
                        onChange={(nextFiles) =>
                          setItemImageFile(nextFiles[0] ?? null)
                        }
                        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                        multiple={false}
                      />
                    </Form.Item>
                  </div>
                </Form>
                <div className="flex justify-end gap-2">
                  <Button onClick={cancelItemForm}>
                    {t('hr.buttons.cancel')}
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => void saveItem()}
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
              footer={
                items.length > 0
                  ? () => (
                      <div className="flex justify-end gap-4 pr-2 text-sm font-medium">
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
          </FormLayout>
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
                  label={t('hr.form.vendor')}
                  value={detailsSnapshot.vendorName?.trim() || '—'}
                />
                <ReviewItem
                  label={t('hr.form.estimatedTotal')}
                  value={formatEtbAmount(totalEtb)}
                />
                <ReviewItem
                  label={t('hr.form.justification')}
                  value={detailsSnapshot.justification?.trim() || '—'}
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
      showItemForm,
      editingKey,
      itemForm,
      itemImageFile,
      itemColumns,
      reviewItemColumns,
      items,
      totalEtb,
      gmRequired,
      detailsSnapshot,
      files,
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
