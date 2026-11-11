'use client';

import '@/components/modules/hr/overtime/overtime-entries-v2.css';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Grid,
  Input,
  InputNumber,
  Space,
  Table,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Receipt } from 'lucide-react';
import dayjs from 'dayjs';
import ProfileFileTypeIcon from '@/components/modules/users/ProfileFileTypeIcon';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { disableFutureDates } from '@/lib/utils/date-validation';
import { apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AddExpenseClaimItemPayload,
  ExpenseClaimDetail,
} from '@/lib/api/expense-claim.types';
import {
  buildExpenseClaimItemFormData,
  useCreateExpenseClaim,
} from '@/lib/query/expense-claim';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
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
}

interface ClientItem extends AddExpenseClaimItemPayload {
  _key: string;
}

interface ExpenseClaimFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: ExpenseClaimDetail) => void;
}

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
        className="m-0 max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
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
 * Expense claim create form - same StepperForm chrome as Add Employee.
 */
export default function ExpenseClaimForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: ExpenseClaimFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('EXPENSE_CLAIM');
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
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateExpenseClaim();

  const totalEtb = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.amount), 0),
    [items],
  );

  function resetForm(): void {
    onBehalf.reset();
    detailsForm.resetFields();
    itemForm.resetFields();
    setItems([]);
    setDetailsSnapshot({});
    setEditingKey(null);
    setShowItemForm(false);
    setReceiptFiles([]);
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
    setReceiptFiles([]);
    setShowItemForm(true);
  }

  function openEditItem(item: ClientItem): void {
    setEditingKey(item._key);
    itemForm.setFieldsValue({
      category: item.category,
      description: item.description,
      expenseDate: dayjs(item.expenseDate),
      amount: item.amount,
    });
    setReceiptFiles(item.files ?? []);
    setShowItemForm(true);
  }

  function cancelItemForm(): void {
    setShowItemForm(false);
    setEditingKey(null);
    itemForm.resetFields();
    setReceiptFiles([]);
  }

  async function saveItem(): Promise<void> {
    try {
      const values = await itemForm.validateFields();
      if (receiptFiles.length === 0 && !editingKey) {
        messageApi.warning(t('hr.messages.attachReceiptRequired'));
        return;
      }
      const base = {
        category: values.category.trim(),
        description: values.description.trim(),
        expenseDate: values.expenseDate.format('YYYY-MM-DD'),
        amount: Number(values.amount),
        currency: 'ETB' as const,
      };
      // One item, all of its receipt files (never one item per file).
      const entry: ClientItem = {
        ...base,
        _key: editingKey ?? nextKey(),
        files: receiptFiles,
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

  /** Creates the claim (DRAFT) and adds every item with all of its receipts. */
  async function saveClaimWithItems(values: Step1Values): Promise<ExpenseClaimDetail> {
    const created = await createMutation.mutateAsync({
      ...onBehalf.payload,
      title: values.title?.trim() ?? '',
      description: values.description?.trim() || undefined,
    });
    let latest = created;
    for (const item of items) {
      const { _key: _unused, ...payload } = item;
      latest = await apiPostForm<ExpenseClaimDetail>(
        `/hr/expense-claims/${created.id}/items`,
        buildExpenseClaimItemFormData(payload),
      );
    }
    return latest;
  }

  /**
   * Saves the claim as a DRAFT without submitting it (receipts may still be
   * missing). It is finished later from My Expense Claims or My Drafts.
   */
  async function handleSaveDraft(): Promise<void> {
    setFormError(null);
    const values = {
      ...detailsSnapshot,
      ...detailsForm.getFieldsValue(true),
    };
    if (!values.title?.trim()) {
      messageApi.warning(t('hr.validation.titleRequired'));
      return;
    }
    setSavingDraft(true);
    try {
      const draft = await saveClaimWithItems(values);
      messageApi.success(t('hr.messages.expenseClaimDraftSaved'));
      onSuccess(draft);
    } catch (error: unknown) {
      const message = t('hr.messages.failedToSaveExpenseClaimDraft');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSavingDraft(false);
    }
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
      if (!item.files?.length) {
        messageApi.warning(t('hr.messages.attachReceiptRequired'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await saveClaimWithItems(values);

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
      width: 100,
      render: (value: string) => formatDisplayDate(value),
    },
    {
      title: t('hr.table.category'),
      dataIndex: 'category',
      key: 'category',
      width: 140,
      ellipsis: true,
      responsive: ['md'],
    },
    {
      title: t('hr.table.description'),
      key: 'description',
      width: 260,
      ellipsis: true,
      render: (_: unknown, row: ClientItem) => (
        <div className="min-w-0 max-w-[260px]">
          <span className="erp-users-cell-strong block truncate" title={row.description}>
            {row.description}
          </span>
          <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
            {row.category}
          </p>
        </div>
      ),
    },
    {
      title: t('hr.table.amount'),
      key: 'amount',
      width: isNarrow ? 110 : 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) => formatEtbAmount(row.amount),
    },
    {
      title: t('hr.table.receipt'),
      key: 'receipt',
      width: isNarrow ? 72 : 140,
      responsive: ['sm'],
      render: (_: unknown, row: ClientItem) =>
        row.files?.length ? (
          <Tooltip title={row.files.map((file) => file.name).join(', ')}>
            <span className="inline-flex items-center gap-1">
              <ProfileFileTypeIcon
                name={row.files[0].name}
                fileType={row.files[0].type}
                size="sm"
              />
              {row.files.length > 1 ? (
                <span className="erp-users-cell-sub">
                  {t('hr.form.receiptFileCount', { count: row.files.length })}
                </span>
              ) : null}
            </span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 72,
      fixed: isCompact ? ('right' as const) : undefined,
      render: (_: unknown, row: ClientItem) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEditItem(row)}
            aria-label={t('common.update')}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeItem(row._key)}
            aria-label={t('common.delete')}
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
          </div>
        ),
      },
      {
        title: t('hr.section.items'),
        validate: () => validateItemsStep(),
        content: (
          <section
            className="erp-pro-card erp-ot-entries min-w-0"
            aria-labelledby="expense-claim-items-title"
          >
            <div className="erp-ot-entries-header">
              <h3
                id="expense-claim-items-title"
                className="erp-ot-entries-title"
              >
                {t('hr.section.items')}
                <span className="erp-ot-entries-count">
                  {items.length.toLocaleString()}
                </span>
              </h3>
              <div className="erp-ot-entries-actions">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openAddItem}
                >
                  {t('hr.buttons.addItem')}
                </Button>
              </div>
            </div>
            <Table<ClientItem>
              rowKey="_key"
              size="middle"
              tableLayout="fixed"
              className="erp-pro-table erp-users-table"
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              scroll={{ x: isNarrow ? 480 : isCompact ? 720 : 900 }}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<Receipt size={28} strokeWidth={1.5} />}
                    title={t('hr.empty.noItems')}
                    description={t(
                      'pages.hr.expenseClaim.itemsStepDescription',
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
                          {t('hr.table.total')}:{' '}
                          <strong>{formatEtbAmount(totalEtb)}</strong>
                        </span>
                      </div>
                    )
                  : undefined
              }
            />
          </section>
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
                  value={detailsSnapshot.title?.trim() || '-'}
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
                  value={detailsSnapshot.description?.trim() || '-'}
                />
              </div>
            </FormLayout>

            <section
              className="erp-pro-card erp-ot-entries min-w-0"
              aria-labelledby="expense-claim-review-items-title"
            >
              <div className="erp-ot-entries-header">
                <h3
                  id="expense-claim-review-items-title"
                  className="erp-ot-entries-title"
                >
                  {t('hr.section.items')}
                  <span className="erp-ot-entries-count">
                    {items.length.toLocaleString()}
                  </span>
                </h3>
              </div>
              <Table<ClientItem>
                rowKey="_key"
                size="middle"
                tableLayout="fixed"
                className="erp-pro-table erp-users-table"
                columns={reviewItemColumns}
                dataSource={items}
                pagination={false}
                scroll={{ x: isNarrow ? 420 : isCompact ? 640 : 800 }}
                locale={{ emptyText: t('hr.empty.noItems') }}
                footer={() => (
                  <div className="flex justify-end px-1 text-sm font-medium sm:pr-2">
                    <span style={{ color: tokens.colorTextPrimary }}>
                      {t('hr.table.total')}:{' '}
                      <strong>{formatEtbAmount(totalEtb)}</strong>
                    </span>
                  </div>
                )}
              />
            </section>
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
      totalEtb,
      detailsSnapshot,
      isNarrow,
      isCompact,
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
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={submitting || savingDraft || createMutation.isPending}
        contentVariant="sections"
        submitLabel={t('hr.buttons.submitClaim')}
        extraActions={
          <Button
            onClick={() => void handleSaveDraft()}
            loading={savingDraft}
            disabled={submitting}
            style={{ borderRadius: 8 }}
          >
            {t('hr.buttons.saveAsDraft')}
          </Button>
        }
      />
      <Drawer
        open={showItemForm}
        title={
          <div className="min-w-0 py-1">
            <div className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
              {editingKey ? t('hr.form.editItem') : t('hr.form.newItem')}
            </div>
            <div className="mt-0.5 text-[12px] font-normal text-[var(--color-text-secondary)]">
              {editingKey
                ? t('hr.dialog.editExpenseItemHint')
                : t('hr.dialog.addExpenseItemHint')}
            </div>
          </div>
        }
        size={520}
        className="erp-responsive-drawer erp-expense-item-drawer"
        styles={detailDrawerStyles}
        onClose={cancelItemForm}
        destroyOnHidden
        footer={
          <div className="erp-expense-item-drawer-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={cancelItemForm}>{t('hr.buttons.cancel')}</Button>
            <Button type="primary" onClick={() => void saveItem()}>
              {editingKey ? t('common.save') : t('hr.buttons.addItem')}
            </Button>
          </div>
        }
      >
        <Form
          form={itemForm}
          layout="vertical"
          requiredMark={false}
          component={false}
          className="erp-drawer-form"
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Form.Item
                  name="amount"
                  className="!mb-0"
                  style={{ flex: 1 }}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.amountRequired'),
                    },
                  ]}
                >
                  <InputNumber
                    className="w-full"
                    min={0.01}
                    precision={2}
                  />
                </Form.Item>
                <Button disabled style={{ pointerEvents: 'none', color: 'inherit', flexShrink: 0 }}>ETB</Button>
              </div>
            </DrawerSection>

            <DrawerSection title={t('hr.form.receipt')}>
              <Form.Item
                required
                className="!mb-0"
                extra={t('hr.hints.receiptRequired')}
              >
                <FileUploadInput
                  files={receiptFiles}
                  onChange={setReceiptFiles}
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple={true}
                />
              </Form.Item>
            </DrawerSection>
          </div>
        </Form>
      </Drawer>
    </Form>
  );
}
