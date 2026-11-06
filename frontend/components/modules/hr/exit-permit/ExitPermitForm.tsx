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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { DoorOpen } from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import HrFormItemsSection, {
  HrDrawerFormSection,
} from '@/components/modules/hr/shared/HrFormItemsSection';
import HrItemFormDrawer from '@/components/modules/hr/shared/HrItemFormDrawer';
import TableEmptyState from '@/components/ui/TableEmptyState';
import DocumentImageThumb from '@/components/ui/DocumentImageThumb/DocumentImageThumb';
import LocalFileImageThumb from '@/components/ui/DocumentImageThumb/LocalFileImageThumb';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { disablePastDates } from '@/lib/utils/date-validation';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { apiPostForm } from '@/lib/api/client';
import type {
  AddExitPermitItemPayload,
  CreateExitPermitItemPayload,
  ExitPermitDetail,
  ExitPermitDirection,
} from '@/lib/api/exit-permit.types';
import { useQueryClient } from '@tanstack/react-query';
import { approvalKeys } from '@/lib/query/approvals';
import {
  buildExitPermitItemFormData,
  exitPermitKeys,
  useCreateExitPermit,
  useUpdateExitPermit,
} from '@/lib/query/exit-permit';
import { useDepartments } from '@/lib/query/org';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import {
  EXIT_PERMIT_DIRECTION_OPTIONS,
  formatExitPermitDirection,
} from '@/lib/utils/exit-permit-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface Step1Values {
  direction?: ExitPermitDirection;
  date?: Dayjs | null;
  departmentId?: string | null;
}

type ItemFormValues = {
  itemName?: string;
  issue?: string;
  quantity?: number;
  unit?: string;
};

interface ClientItem extends AddExitPermitItemPayload {
  _key: string;
}

interface ExitPermitFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: ExitPermitDetail) => void;
  /** Edit mode: the employee's own DRAFT / RETURNED permit, prefilled. */
  initialRecord?: ExitPermitDetail;
}

const DETAILS_FIELDS = ['direction', 'date'] as const;
const EXIT_PERMIT_PATH = '/hr/exit-permits';

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/** Saved items as client rows; existing images stay linked by documentId. */
function clientItemsFrom(record: ExitPermitDetail): ClientItem[] {
  return record.items.map((item) => ({
    _key: nextKey(),
    itemName: item.itemName,
    issue: item.issue ?? undefined,
    quantity: Number(item.quantity) || 1,
    unit: item.unit ?? undefined,
    documentId: item.documentId ?? undefined,
  }));
}

function toItemPayload(
  item: Pick<ClientItem, 'itemName' | 'issue' | 'quantity' | 'unit' | 'documentId'>,
): CreateExitPermitItemPayload {
  return {
    itemName: item.itemName,
    issue: item.issue ?? undefined,
    quantity: Number(item.quantity) || 1,
    unit: item.unit ?? undefined,
    documentId: item.documentId ?? undefined,
  };
}

/**
 * Exit permit create form - same StepperForm chrome as Add Employee.
 */
export default function ExitPermitForm({
  onSuccess,
  initialRecord,
  onCancel,
  cancelLabel,
}: ExitPermitFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('EXIT_PERMIT');
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const lookupUserName = useUserNameLookup();
  const createMutation = useCreateExitPermit();
  const updateMutation = useUpdateExitPermit(initialRecord?.id ?? '');
  const queryClient = useQueryClient();

  const initialDetails = useMemo<Step1Values>(
    () =>
      initialRecord
        ? {
            direction: initialRecord.direction,
            date: dayjs(initialRecord.date),
            departmentId: initialRecord.departmentId ?? null,
          }
        : { direction: 'EXIT', date: dayjs() },
    [initialRecord],
  );
  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();
  const [detailsSnapshot, setDetailsSnapshot] =
    useState<Step1Values>(initialDetails);
  const [items, setItems] = useState<ClientItem[]>(() =>
    initialRecord ? clientItemsFrom(initialRecord) : [],
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const departmentsQuery = useDepartments(
    { page: 1, limit: 100, isActive: true },
    true,
  );

  const departmentOptions = useMemo(
    () =>
      (departmentsQuery.data?.data ?? []).map((department) => ({
        value: department.id,
        label: department.name,
      })),
    [departmentsQuery.data],
  );

  const directionOptions = useMemo(
    () =>
      EXIT_PERMIT_DIRECTION_OPTIONS.map((option) => ({
        value: option.value,
        label: formatExitPermitDirection(option.value, t),
      })),
    [t],
  );

  function resetForm(): void {
    onBehalf.reset();
    detailsForm.resetFields();
    itemForm.resetFields();
    setDetailsSnapshot(initialDetails);
    setItems(initialRecord ? clientItemsFrom(initialRecord) : []);
    setEditingKey(null);
    setShowItemForm(false);
    setItemImageFile(null);
    setFiles([]);
    setFormError(null);
  }

  function captureDetailsSnapshot(): Step1Values {
    const values = detailsForm.getFieldsValue(true);
    setDetailsSnapshot(values);
    return values;
  }

  function findDepartment(id: string | null | undefined): string {
    if (!id) return '-';
    return (
      departmentOptions.find((option) => option.value === id)?.label ?? '-'
    );
  }

  function findEmployee(id: string | null | undefined): string {
    if (!id) return '-';
    return lookupUserName(id);
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
      messageApi.warning(t('hr.validation.addExitPermitItem'));
      return false;
    }
    captureDetailsSnapshot();
    return true;
  }

  function openAddItem(): void {
    setEditingKey(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({ quantity: 1 });
    setItemImageFile(null);
    setShowItemForm(true);
  }

  function openEditItem(item: ClientItem): void {
    setEditingKey(item._key);
    itemForm.setFieldsValue({
      itemName: item.itemName,
      issue: item.issue,
      quantity: item.quantity,
      unit: item.unit,
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
      const entry: ClientItem = {
        _key: editingKey ?? nextKey(),
        itemName: values.itemName?.trim() ?? '',
        issue: values.issue?.trim() || undefined,
        quantity: Number(values.quantity) || 1,
        unit: values.unit?.trim() || undefined,
        file: itemImageFile ?? undefined,
        // Keep a saved image unless a new one was chosen.
        documentId: itemImageFile
          ? undefined
          : items.find((row) => row._key === editingKey)?.documentId,
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

    if (!values.direction) {
      messageApi.warning(t('hr.validation.directionRequired'));
      return;
    }

    if (items.length === 0) {
      messageApi.warning(t('hr.validation.addExitPermitItem'));
      return;
    }

    setSubmitting(true);
    if (initialRecord) {
      try {
        // New images upload through the item endpoint first (still DRAFT /
        // RETURNED); the PATCH then sets the full item list, including them.
        const originalItemIds = new Set(initialRecord.items.map((row) => row.id));
        let latest: ExitPermitDetail | null = null;
        for (const item of items.filter((row) => row.file)) {
          const { _key: _unused, documentId: _replaced, ...payload } = item;
          latest = await apiPostForm<ExitPermitDetail>(
            `${EXIT_PERMIT_PATH}/${initialRecord.id}/items`,
            buildExitPermitItemFormData(payload),
          );
        }
        const uploaded = (latest?.items ?? []).filter(
          (row) => !originalItemIds.has(row.id),
        );
        const saved = await updateMutation.mutateAsync({
          direction: values.direction,
          date: values.date ? values.date.format('YYYY-MM-DD') : undefined,
          departmentId: values.departmentId || null,
          items: [
            ...items.filter((row) => !row.file).map(toItemPayload),
            ...uploaded.map((row) =>
              toItemPayload({
                itemName: row.itemName,
                issue: row.issue ?? undefined,
                quantity: Number(row.quantity),
                unit: row.unit ?? undefined,
                documentId: row.documentId ?? undefined,
              }),
            ),
          ],
        });
        messageApi.success(t('pages.approvals.edit.saved'));
        onSuccess(saved);
      } catch (error: unknown) {
        void queryClient.invalidateQueries({ queryKey: exitPermitKeys.all });
        const message = t('pages.approvals.edit.failed');
        notifyApiError(error, message, messageApi);
        setFormError(message);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        ...onBehalf.payload,
        direction: values.direction,
        date: values.date ? values.date.format('YYYY-MM-DD') : undefined,
        departmentId: values.departmentId || undefined,
      });

      await Promise.all(
        items.map((item) => {
          const { _key: _unused, ...payload } = item;
          return apiPostForm<ExitPermitDetail>(
            `${EXIT_PERMIT_PATH}/${created.id}/items`,
            buildExitPermitItemFormData(payload),
          );
        }),
      );

      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const finalResult = await apiPostForm<ExitPermitDetail>(
        `${EXIT_PERMIT_PATH}/${created.id}/submit`,
        formData,
      );

      // The create mutation cached the permit before its items were added;
      // replace that copy so the detail and approval pages show the items.
      queryClient.setQueryData(exitPermitKeys.detail(created.id), finalResult);
      void queryClient.invalidateQueries({ queryKey: exitPermitKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });

      messageApi.success(t('hr.messages.exitPermitSubmitted'));
      onSuccess(finalResult);
    } catch (error: unknown) {
      void queryClient.invalidateQueries({ queryKey: exitPermitKeys.all });
      const message = t('hr.messages.exitPermitSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: t('hr.table.itemImage'),
      dataIndex: 'file',
      key: 'file',
      width: 56,
      render: (value: File | undefined, row: ClientItem) =>
        !value && row.documentId ? (
          <DocumentImageThumb
            documentId={row.documentId}
            size={40}
            emptyLabel={t('hr.labels.noItemImage')}
          />
        ) : (
          <LocalFileImageThumb
            file={value}
            size={40}
            emptyLabel={t('hr.labels.noItemImage')}
          />
        ),
    },
    {
      title: t('hr.table.itemName'),
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
      render: (value: string, row: ClientItem) => (
        <div className="min-w-0">
          <p className="m-0 truncate font-medium">{value}</p>
          {row.issue?.trim() ? (
            <p className="m-0 mt-0.5 truncate text-xs opacity-70">{row.issue}</p>
          ) : null}
        </div>
      ),
    },
    {
      title: t('hr.table.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
    },
    { title: t('hr.table.unit'), dataIndex: 'unit', key: 'unit', width: 72 },
    {
      title: '',
      key: 'actions',
      width: 72,
      fixed: 'right',
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
              description={t('pages.hr.exitPermit.detailsStepDescription')}
            >
              <div className="erp-form-grid-2">
                <Form.Item
                  name="direction"
                  label={t('hr.form.direction')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.directionRequired'),
                    },
                  ]}
                >
                  <Select
                    options={directionOptions}
                    placeholder={t('hr.placeholder.selectDirection')}
                  />
                </Form.Item>
                <Form.Item
                  name="date"
                  label={t('hr.form.date')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.dateRequired'),
                    },
                  ]}
                >
                  <DatePicker
                    className="w-full"
                    placeholder={t('hr.placeholder.selectDate')}
                    disabledDate={disablePastDates}
                  />
                </Form.Item>
                <Form.Item
                  name="departmentId"
                  label={t('hr.form.department')}
                >
                  <Select
                    allowClear
                    showSearch={{ optionFilterProp: 'label' }}
                    loading={departmentsQuery.isLoading}
                    placeholder={t('hr.placeholder.selectDepartment')}
                    options={departmentOptions}
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
            titleId="exit-permit-items-title"
            title={t('hr.section.items')}
            count={items.length}
            headerExtra={
              <p className="m-0 px-4 pt-4 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {t('pages.hr.exitPermit.itemsStepDescription')}
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
              scroll={{ x: 'max-content' }}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<DoorOpen size={28} strokeWidth={1.5} />}
                    title={t('hr.empty.noItems')}
                    description={t('pages.hr.exitPermit.itemsStepDescription')}
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
              description={t('pages.hr.exitPermit.reviewStepDescription')}
            >
              <div className="erp-form-grid-2">
                <ReviewItem
                  label={t('hr.form.direction')}
                  value={
                    detailsSnapshot.direction
                      ? formatExitPermitDirection(
                          detailsSnapshot.direction,
                          t,
                        )
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.form.date')}
                  value={
                    detailsSnapshot.date
                      ? formatDisplayDate(
                          detailsSnapshot.date.format('YYYY-MM-DD'),
                        )
                      : '-'
                  }
                />
                <ReviewItem
                  label={t('hr.form.department')}
                  value={findDepartment(detailsSnapshot.departmentId)}
                />
                {onBehalf.employeeId ? (
                  <ReviewItem
                    label={t('hr.table.onBehalf')}
                    value={findEmployee(onBehalf.employeeId)}
                  />
                ) : null}
                <ReviewItem
                  label={t('hr.section.items')}
                  value={t('hr.form.itemCount', { count: items.length })}
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
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: t('hr.empty.noItems') }}
              />
            </FormLayout>

            {initialRecord ? null : (
              // Edit saves are JSON; supporting documents stay as submitted.
              <FormLayout
                variant="pro"
                title={t('hr.form.supportingDocuments')}
                description={t(
                  'pages.hr.exitPermit.attachmentsStepDescription',
                )}
              >
                <FileUploadInput
                  files={files}
                  onChange={setFiles}
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg"
                  placeholder={t('hr.placeholder.chooseSupportingDocuments')}
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
      canViewHr,
      departmentOptions,
      departmentsQuery.isLoading,
      directionOptions,
      lookupUserName,
    ],
  );

  const itemDrawerTitle = editingKey
    ? t('hr.form.editItem')
    : t('hr.form.newItem');
  const itemDrawerHint = editingKey
    ? t('hr.dialog.editExitPermitItemHint')
    : t('hr.dialog.addExitPermitItemHint');

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
        drawerClassName="erp-exit-permit-item-drawer"
      >
        <Form
          form={itemForm}
          layout="vertical"
          requiredMark={false}
          component={false}
          className="erp-drawer-form"
        >
          <HrDrawerFormSection title={t('hr.section.itemDetails')}>
            <div className="erp-hr-item-drawer-grid-single">
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
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item name="issue" label={t('hr.form.issue')}>
                <Input maxLength={100} />
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
                <InputNumber min={1} className="w-full" />
              </Form.Item>
              <Form.Item name="unit" label={t('hr.form.unit')}>
                <Input
                  placeholder={t('hr.placeholder.enterUnit')}
                  maxLength={100}
                />
              </Form.Item>
            </div>
          </HrDrawerFormSection>
          <HrDrawerFormSection title={t('hr.form.itemImage')}>
            <FileUploadInput
              files={itemImageFile ? [itemImageFile] : []}
              onChange={(nextFiles) => setItemImageFile(nextFiles[0] ?? null)}
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              multiple={false}
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
