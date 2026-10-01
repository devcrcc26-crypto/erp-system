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
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
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
import { disableAllButToday } from '@/lib/utils/date-validation';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { apiPostForm } from '@/lib/api/client';
import type {
  AddExitPermitItemPayload,
  ExitPermitDetail,
  ExitPermitDirection,
} from '@/lib/api/exit-permit.types';
import {
  buildExitPermitItemFormData,
  useCreateExitPermit,
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
  onSuccess: (result: ExitPermitDetail) => void;
}

const DETAILS_FIELDS = ['direction', 'date'] as const;
const EXIT_PERMIT_PATH = '/hr/exit-permits';

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/**
 * Exit permit create form - same StepperForm chrome as Add Employee.
 */
export default function ExitPermitForm({
  onSuccess,
}: ExitPermitFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('EXIT_PERMIT');
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const lookupUserName = useUserNameLookup();
  const createMutation = useCreateExitPermit();

  const [detailsForm] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();
  const [detailsSnapshot, setDetailsSnapshot] = useState<Step1Values>({
    direction: 'EXIT',
  });
  const [items, setItems] = useState<ClientItem[]>([]);
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
    setDetailsSnapshot({ direction: 'EXIT' });
    setItems([]);
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

      messageApi.success(t('hr.messages.exitPermitSubmitted'));
      onSuccess(finalResult);
    } catch (error: unknown) {
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
      render: (value: File | undefined) => (
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
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
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
                    disabledDate={disableAllButToday}
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
          <FormLayout
            variant="pro"
            title={t('hr.section.items')}
            description={t('pages.hr.exitPermit.itemsStepDescription')}
            extra={
              !showItemForm ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openAddItem}
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.addItem')}
                </Button>
              ) : undefined
            }
          >
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
                <div className="erp-form-grid-1">
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
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: t('hr.empty.noItems') }}
              footer={
                items.length > 0
                  ? () => (
                      <div className="flex justify-end pr-2 text-sm font-medium">
                        <span style={{ color: tokens.colorTextSecondary }}>
                          {t('hr.form.itemCount', { count: items.length })}
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
                locale={{ emptyText: t('hr.empty.noItems') }}
              />
            </FormLayout>

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
          </div>
        ),
      },
    ],
    [
      onBehalf,
      t,
      showItemForm,
      editingKey,
      itemForm,
      itemColumns,
      reviewItemColumns,
      items,
      detailsSnapshot,
      files,
      canViewHr,
      departmentOptions,
      departmentsQuery.isLoading,
      directionOptions,
      itemImageFile,
      lookupUserName,
    ],
  );

  return (
    <Form<Step1Values>
      form={detailsForm}
      layout="vertical"
      requiredMark={false}
      preserve
      initialValues={{ direction: 'EXIT' }}
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
