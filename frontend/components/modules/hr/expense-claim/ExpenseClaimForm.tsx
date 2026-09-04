'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AddExpenseClaimItemPayload,
  ExpenseClaimDetail,
  SupportedCurrency,
} from '@/lib/api/expense-claim.types';
import { useCurrencyRates } from '@/lib/query/currency';
import {
  buildExpenseClaimItemFormData,
  useCreateExpenseClaim,
} from '@/lib/query/expense-claim';
import { tokens } from '@/lib/theme/tokens';
import {
  formatCurrencyAmount,
  formatEtbAmount,
} from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatDisplayDate } from '@/lib/utils/date-format';

interface Step1Values {
  title?: string;
  description?: string;
}

interface ItemFormValues {
  category: string;
  description: string;
  expenseDate: dayjs.Dayjs;
  amount: number;
  currency: SupportedCurrency;
}

interface ClientItem extends AddExpenseClaimItemPayload {
  _key: string;
}

interface ExpenseClaimFormProps {
  onSuccess: (result: ExpenseClaimDetail) => void;
}

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'ETB', label: 'ETB - Ethiopian Birr' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
];

const DETAILS_FIELDS = ['title'] as const;

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
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

/**
 * Expense claim create form — same StepperForm chrome as Add Employee.
 */
export default function ExpenseClaimForm({
  onSuccess,
}: ExpenseClaimFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const [items, setItems] = useState<ClientItem[]>([]);
  const [detailsSnapshot, setDetailsSnapshot] = useState<Step1Values>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ratesQuery = useCurrencyRates();
  const createMutation = useCreateExpenseClaim();

  function getRate(currency: SupportedCurrency): number {
    if (currency === 'ETB') {
      return 1;
    }
    return ratesQuery.data?.[currency] ?? 1;
  }

  const totalEtb = useMemo(
    () =>
      items.reduce((sum, item) => {
        return sum + Number(item.amount) * getRate(item.currency);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, ratesQuery.data],
  );

  function itemEtb(item: ClientItem): number {
    return Number(item.amount) * getRate(item.currency);
  }

  function resetForm(): void {
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems([]);
    setDetailsSnapshot({});
    setEditingKey(null);
    setShowItemForm(false);
    setReceiptFile(null);
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
      messageApi.warning(t('hr.validation.addExpenseItem'));
      return false;
    }
    captureDetailsSnapshot();
    return true;
  }

  function openAddItem(): void {
    setEditingKey(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({ currency: 'ETB', expenseDate: dayjs() });
    setReceiptFile(null);
    setShowItemForm(true);
  }

  function openEditItem(item: ClientItem): void {
    setEditingKey(item._key);
    itemForm.setFieldsValue({
      category: item.category,
      description: item.description,
      expenseDate: dayjs(item.expenseDate),
      amount: item.amount,
      currency: item.currency,
    });
    setReceiptFile(item.file ?? null);
    setShowItemForm(true);
  }

  function cancelItemForm(): void {
    setShowItemForm(false);
    setEditingKey(null);
    itemForm.resetFields();
    setReceiptFile(null);
  }

  async function saveItem(): Promise<void> {
    try {
      const values = await itemForm.validateFields();
      if (!receiptFile && !editingKey) {
        messageApi.warning(t('hr.messages.attachReceiptRequired'));
        return;
      }
      if (!receiptFile && editingKey) {
        const existing = items.find((row) => row._key === editingKey);
        if (!existing?.file) {
          messageApi.warning(t('hr.messages.attachReceiptRequired'));
          return;
        }
      }
      const entry: ClientItem = {
        _key: editingKey ?? nextKey(),
        category: values.category.trim(),
        description: values.description.trim(),
        expenseDate: values.expenseDate.format('YYYY-MM-DD'),
        amount: Number(values.amount),
        currency: values.currency,
        file: receiptFile ?? undefined,
      };
      if (editingKey) {
        setItems((prev) =>
          prev.map((row) => {
            if (row._key !== editingKey) {
              return row;
            }
            return {
              ...entry,
              file: receiptFile ?? row.file,
            };
          }),
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

    if (!values.title?.trim()) {
      messageApi.warning(t('hr.validation.titleRequired'));
      return;
    }

    if (items.length === 0) {
      messageApi.warning(t('hr.validation.addExpenseItem'));
      return;
    }

    for (const item of items) {
      if (!item.file) {
        messageApi.warning(t('hr.messages.attachReceiptRequired'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });

      for (const item of items) {
        const { _key: _unused, ...payload } = item;
        await apiPostForm<ExpenseClaimDetail>(
          `/hr/expense-claims/${created.id}/items`,
          buildExpenseClaimItemFormData(payload),
        );
      }

      const submitted = await apiPost<ExpenseClaimDetail>(
        `/hr/expense-claims/${created.id}/submit`,
      );

      messageApi.success(t('hr.messages.expenseClaimSubmitted'));
      onSuccess(submitted);
    } catch (error: unknown) {
      const message = t('hr.messages.failedToSubmitExpenseClaim');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: t('hr.table.date'),
      dataIndex: 'expenseDate',
      key: 'expenseDate',
      width: 110,
      render: (value: string) => formatDisplayDate(value),
    },
    {
      title: t('hr.table.category'),
      dataIndex: 'category',
      key: 'category',
      width: 140,
      ellipsis: true,
    },
    {
      title: t('hr.table.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: t('hr.table.amount'),
      key: 'amount',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) =>
        formatCurrencyAmount(row.amount, row.currency),
    },
    {
      title: t('hr.table.etbEquivalent'),
      key: 'amountEtb',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) => formatEtbAmount(itemEtb(row)),
    },
    {
      title: t('hr.table.receipt'),
      key: 'receipt',
      width: 140,
      render: (_: unknown, row: ClientItem) =>
        row.file ? (
          <Typography.Text ellipsis className="text-xs">
            {row.file.name}
          </Typography.Text>
        ) : (
          '—'
        ),
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

  const watchedAmount = Form.useWatch('amount', itemForm);
  const watchedCurrency = Form.useWatch('currency', itemForm) as
    | SupportedCurrency
    | undefined;

  const liveEtbPreview = useMemo(() => {
    if (!watchedAmount || !watchedCurrency) {
      return null;
    }
    return Number(watchedAmount) * getRate(watchedCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedAmount, watchedCurrency, ratesQuery.data]);

  const steps = useMemo(
    () => [
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.requestDetails')}
            description={t('pages.hr.expenseClaim.detailsStepDescription')}
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
              name="description"
              label={t('hr.form.description')}
              className="!mb-0"
              extra={t('pages.hr.expenseClaim.descriptionHint')}
            >
              <Input.TextArea
                rows={4}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterExpenseClaimDescription')}
              />
            </Form.Item>
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
            description={t('pages.hr.expenseClaim.itemsStepDescription')}
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
                  ? 'mb-4 rounded-[12px] border border-[#e8ebef] p-4'
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
                  <Form.Item
                    name="description"
                    label={t('hr.form.description')}
                    className="sm:col-span-2"
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
                    initialValue="ETB"
                    rules={[{ required: true }]}
                  >
                    <Select options={CURRENCY_OPTIONS} />
                  </Form.Item>
                  {liveEtbPreview != null ? (
                    <div className="sm:col-span-2 mb-3 rounded-lg border border-[#1D9E75]/30] bg-[#E1F5EE] px-3 py-2.5">
                      <p className="m-0 text-[10px] font-medium uppercase tracking-[0.04em] text-[#0F6E56]">
                        {t('hr.form.etbEquivalent')}
                      </p>
                      <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-[#0F6E56]">
                        {formatEtbAmount(liveEtbPreview)}
                      </p>
                    </div>
                  ) : null}
                  <Form.Item
                    label={t('hr.form.receipt')}
                    required
                    className="sm:col-span-2 !mb-0"
                    extra={t('hr.hints.receiptRequired')}
                  >
                    <FileUploadInput
                      files={receiptFile ? [receiptFile] : []}
                      onChange={(nextFiles) =>
                        setReceiptFile(nextFiles[0] ?? null)
                      }
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple={false}
                    />
                  </Form.Item>
                </div>
              </Form>
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={cancelItemForm}>{t('hr.buttons.cancel')}</Button>
                <Button type="primary" onClick={() => void saveItem()}>
                  {editingKey ? t('common.save') : t('hr.buttons.addItem')}
                </Button>
              </div>
            </div>

            <Table<ClientItem>
              rowKey="_key"
              size="small"
              className="erp-pro-table erp-users-table"
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
                          {t('hr.table.total')}:{' '}
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
            <FormLayout
              variant="pro"
              title={t('hr.form.reviewSubmit')}
              description={t('pages.hr.expenseClaim.reviewStepDescription')}
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
                  label={t('hr.table.total')}
                  value={formatEtbAmount(totalEtb)}
                />
                <ReviewItem
                  label={t('hr.form.description')}
                  value={detailsSnapshot.description?.trim() || '—'}
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
                className="erp-pro-table erp-users-table"
                columns={reviewItemColumns}
                dataSource={items}
                pagination={false}
                locale={{ emptyText: t('hr.empty.noItems') }}
                footer={() => (
                  <div className="flex justify-end pr-2 text-sm font-medium">
                    <span style={{ color: tokens.colorTextPrimary }}>
                      {t('hr.table.total')}:{' '}
                      <strong>{formatEtbAmount(totalEtb)}</strong>
                    </span>
                  </div>
                )}
              />
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
      receiptFile,
      itemColumns,
      reviewItemColumns,
      items,
      totalEtb,
      detailsSnapshot,
      liveEtbPreview,
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
        isSubmitting={submitting || createMutation.isPending}
        contentVariant="sections"
        submitLabel={t('hr.buttons.submitClaim')}
      />
    </Form>
  );
}
