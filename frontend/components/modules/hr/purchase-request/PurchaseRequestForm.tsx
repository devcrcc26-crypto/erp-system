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
  Steps,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AddPurchaseRequestItemPayload,
  PurchaseRequestDetail,
  SupportedCurrency,
} from '@/lib/api/purchase-request.types';
import { useCreatePurchaseRequest } from '@/lib/query/purchase-request';
import { useAllProjects } from '@/lib/query/projects';
import { useCurrencyRates } from '@/lib/query/currency';
import { tokens } from '@/lib/theme/tokens';
import {
  formatCurrencyAmount,
  formatEtbAmount,
  PR_GM_THRESHOLD_ETB,
  requiresGmApproval,
} from '@/lib/utils/purchase-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface Step1Values {
  title: string;
  justification: string;
  requiredByDate?: dayjs.Dayjs | null;
  projectId?: string;
  vendorName?: string;
  vendorContact?: string;
}

type ItemFormValues = Omit<AddPurchaseRequestItemPayload, 'description'> & {
  description?: string;
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

let _keyCounter = 0;
function nextKey(): string {
  _keyCounter += 1;
  return `item-${_keyCounter}`;
}

/**
 * 3-step stepper for creating a Purchase Request.
 *
 * Steps 1–2 are client-side only. On Step 3 submit:
 *   createDraft → add each item → submit with files → navigate
 */
export default function PurchaseRequestForm({
  onSuccess,
}: PurchaseRequestFormProps): React.ReactNode {
  const messageApi = useAppMessage();
  const [currentStep, setCurrentStep] = useState(0);

  const [step1Form] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();
  const vendorName = Form.useWatch('vendorName', step1Form);

  const [details, setDetails] = useState<Step1Values | null>(null);
  const [items, setItems] = useState<ClientItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const projectsQuery = useAllProjects({}, true);
  const ratesQuery = useCurrencyRates();
  const createMutation = useCreatePurchaseRequest();

  function getRate(currency: SupportedCurrency): number {
    if (currency === 'ETB') return 1;
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
    return Number(item.unitPrice) * Number(item.quantity) * getRate(item.currency);
  }

  async function goToStep2(): Promise<void> {
    try {
      const values = await step1Form.validateFields();
      setDetails(values);
      setCurrentStep(1);
    } catch {
      /* validation shown inline */
    }
  }

  function goToStep3(): void {
    if (items.length === 0) {
      messageApi.warning('Add at least one line item before continuing');
      return;
    }
    setCurrentStep(2);
  }

  function openAddItem(): void {
    setEditingKey(null);
    itemForm.resetFields();
    itemForm.setFieldValue('currency', 'ETB');
    setShowItemForm(true);
  }

  function openEditItem(item: ClientItem): void {
    setEditingKey(item._key);
    itemForm.setFieldsValue({
      itemName: item.itemName,
      description: item.description ?? '',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      currency: item.currency,
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
        description: values.description || undefined,
        quantity: Number(values.quantity),
        unit: values.unit,
        unitPrice: Number(values.unitPrice),
        currency: values.currency,
      };
      if (editingKey) {
        setItems((prev) =>
          prev.map((it) => (it._key === editingKey ? entry : it)),
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
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  async function handleFinalSubmit(): Promise<void> {
    if (items.length === 0) {
      messageApi.warning('Add at least one line item');
      return;
    }

    let v = details;
    if (!v?.title?.trim() || !v.justification?.trim()) {
      try {
        v = await step1Form.validateFields();
        setDetails(v);
      } catch {
        messageApi.warning('Complete request details before submitting');
        setCurrentStep(0);
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        title: v.title.trim(),
        justification: v.justification.trim(),
        requiredByDate: v.requiredByDate
          ? v.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        projectId: v.projectId,
        vendorName: v.vendorName?.trim() || undefined,
        vendorContact: v.vendorContact?.trim() || undefined,
      });

      await Promise.all(
        items.map((item) => {
          const { _key: _unused, ...payload } = item;
          return apiPost<PurchaseRequestDetail>(
            `/hr/purchase-requests/${created.id}/items`,
            payload,
          );
        }),
      );

      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const finalResult = await apiPostForm<PurchaseRequestDetail>(
        `/hr/purchase-requests/${created.id}/submit`,
        formData,
      );

      messageApi.success('Purchase request submitted for approval');
      onSuccess(finalResult);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit purchase request', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  const projectOptions =
    projectsQuery.data?.data?.map((p) => ({
      value: p.id,
      label: p.projectCode ? `[${p.projectCode}] ${p.name}` : p.name,
    })) ?? [];

  const gmRequired = requiresGmApproval(totalEtb);

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right',
    },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: 'Unit Price',
      key: 'unitPrice',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) =>
        formatCurrencyAmount(row.unitPrice, row.currency),
    },
    {
      title: 'Total (ETB)',
      key: 'totalEtb',
      width: 130,
      align: 'right',
      render: (_: unknown, row: ClientItem) =>
        formatEtbAmount(itemLineEtb(row)),
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

  return (
    <div className="flex flex-col gap-6 pb-8">
      <Steps
        current={currentStep}
        items={[
          { title: 'Request Details' },
          { title: 'Line Items' },
          { title: 'Attachments & Submit' },
        ]}
        style={{ maxWidth: 560, margin: '0 auto' }}
      />

      {/* ─── Step 1: Request Details (kept mounted so field values survive step changes) ─── */}
      <div
        className="mx-auto w-full max-w-2xl flex flex-col gap-4"
        style={{ display: currentStep === 0 ? undefined : 'none' }}
        aria-hidden={currentStep !== 0}
      >
          <SectionCard title="Request Details" bodyClassName="px-5 py-4">
            <Form
              form={step1Form}
              layout="vertical"
              preserve
              onFinish={() => void goToStep2()}
            >
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Enter a title' }]}
              >
                <Input
                  placeholder="e.g. Office supplies — Q3 2026"
                  maxLength={200}
                />
              </Form.Item>

              <Form.Item
                name="justification"
                label="Justification"
                rules={[{ required: true, message: 'Provide a justification' }]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={2000}
                  showCount
                  placeholder="Explain why these items are needed"
                />
              </Form.Item>

              <Form.Item name="requiredByDate" label="Required By Date">
                <DatePicker
                  style={{ width: '100%' }}
                  disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                />
              </Form.Item>

              <Form.Item name="projectId" label="Project (optional)">
                <Select
                  showSearch
                  allowClear
                  placeholder="Select a project"
                  options={projectOptions}
                  loading={projectsQuery.isLoading}
                  filterOption={(input, option) =>
                    String(option?.label ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
              </Form.Item>

              <Form.Item
                name="vendorName"
                label="Vendor / Supplier Name (optional)"
              >
                <Input placeholder="e.g. Acme Supplies Co." maxLength={200} />
              </Form.Item>

              {vendorName ? (
                <Form.Item name="vendorContact" label="Vendor Contact">
                  <Input placeholder="Phone or email" maxLength={200} />
                </Form.Item>
              ) : null}
            </Form>
          </SectionCard>

          <div className="flex justify-end">
            <Button type="primary" onClick={() => void goToStep2()}>
              Continue to Line Items
            </Button>
          </div>
      </div>

      {/* ─── Step 2: Line Items ─── */}
      {currentStep === 1 ? (
        <div className="mx-auto w-full max-w-4xl flex flex-col gap-4">
          <SectionCard
            title="Line Items"
            bodyClassName="px-5 py-4"
            action={
              !showItemForm ? (
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openAddItem}
                >
                  Add Item
                </Button>
              ) : undefined
            }
          >
            {showItemForm ? (
              <div
                className="mb-4 rounded-md p-4"
                style={{
                  background: tokens.colorPageBg,
                  border: `1px solid ${tokens.colorBorder}`,
                }}
              >
                <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                  {editingKey ? 'Edit Item' : 'New Item'}
                </Typography.Text>
                <Form form={itemForm} layout="vertical">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <Form.Item
                      name="itemName"
                      label="Item Name"
                      rules={[{ required: true, message: 'Enter item name' }]}
                    >
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                      <Input maxLength={500} />
                    </Form.Item>
                    <Form.Item
                      name="quantity"
                      label="Quantity"
                      rules={[{ required: true, message: 'Enter quantity' }]}
                    >
                      <InputNumber min={0.001} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="unit"
                      label="Unit"
                      rules={[{ required: true, message: 'Enter unit (e.g. pcs)' }]}
                    >
                      <Input placeholder="pcs, kg, m, box…" maxLength={50} />
                    </Form.Item>
                    <Form.Item
                      name="unitPrice"
                      label="Unit Price"
                      rules={[{ required: true, message: 'Enter unit price' }]}
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="currency"
                      label="Currency"
                      initialValue="ETB"
                      rules={[{ required: true }]}
                    >
                      <Select options={CURRENCY_OPTIONS} />
                    </Form.Item>
                  </div>
                </Form>
                <div className="flex justify-end gap-2">
                  <Button size="small" onClick={cancelItemForm}>
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => void saveItem()}
                  >
                    {editingKey ? 'Update' : 'Add'}
                  </Button>
                </div>
              </div>
            ) : null}

            <Table<ClientItem>
              rowKey="_key"
              size="small"
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              locale={{
                emptyText: 'No items yet — click Add Item to start',
              }}
              footer={
                items.length > 0
                  ? () => (
                      <div className="flex justify-end gap-4 text-sm font-medium pr-2">
                        <span style={{ color: tokens.colorTextSecondary }}>
                          {items.length} item{items.length !== 1 ? 's' : ''}
                        </span>
                        <span style={{ color: tokens.colorTextPrimary }}>
                          Estimated Total:{' '}
                          <strong>{formatEtbAmount(totalEtb)}</strong>
                        </span>
                      </div>
                    )
                  : undefined
              }
            />
          </SectionCard>

          <div className="flex justify-between">
            <Button onClick={() => setCurrentStep(0)}>Back</Button>
            <Button type="primary" onClick={goToStep3}>
              Continue to Attachments
            </Button>
          </div>
        </div>
      ) : null}

      {/* ─── Step 3: Attachments & Submit ─── */}
      {currentStep === 2 ? (
        <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
          <Alert
            type={gmRequired ? 'warning' : 'success'}
            showIcon
            title={
              gmRequired
                ? `Estimated total exceeds ETB ${PR_GM_THRESHOLD_ETB.toLocaleString()} — GM approval will be required`
                : `Estimated total is within ETB ${PR_GM_THRESHOLD_ETB.toLocaleString()} — HR Officer approval sufficient`
            }
            description={`Estimated total: ${formatEtbAmount(totalEtb)}`}
          />

          <SectionCard title="Summary" bodyClassName="px-5 py-4">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p
                  className="text-xs uppercase tracking-wide mb-0.5"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  Title
                </p>
                <p
                  className="font-medium"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {step1Form.getFieldValue('title') as string}
                </p>
              </div>
              <div>
                <p
                  className="text-xs uppercase tracking-wide mb-0.5"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  Line Items
                </p>
                <p style={{ color: tokens.colorTextPrimary }}>
                  {items.length} item{items.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="col-span-2">
                <p
                  className="text-xs uppercase tracking-wide mb-0.5"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  Estimated Total (ETB)
                </p>
                <p
                  className="text-base font-bold"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {formatEtbAmount(totalEtb)}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Supporting Documents (optional)"
            bodyClassName="px-5 py-4"
          >
            <Typography.Text
              type="secondary"
              style={{ fontSize: 13, display: 'block', marginBottom: 12 }}
            >
              Attach quotations, specifications, or other supporting documents.
            </Typography.Text>
            <FileUploadInput
              files={files}
              onChange={setFiles}
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              placeholder="Choose supporting documents"
            />
          </SectionCard>

          <div className="flex justify-between">
            <Button disabled={submitting} onClick={() => setCurrentStep(1)}>
              Back
            </Button>
            <Button
              type="primary"
              loading={submitting}
              onClick={() => void handleFinalSubmit()}
            >
              Submit for Approval
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
