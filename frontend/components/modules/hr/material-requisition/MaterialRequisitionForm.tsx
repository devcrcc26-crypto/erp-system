'use client';

import { useState } from 'react';
import {
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
  AddMaterialRequisitionItemPayload,
  MaterialRequisitionDetail,
} from '@/lib/api/material-requisition.types';
import { useCreateMaterialRequisition } from '@/lib/query/material-requisition';
import { useAllProjects } from '@/lib/query/projects';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface Step1Values {
  title: string;
  purpose: string;
  requiredByDate?: dayjs.Dayjs | null;
  projectId?: string;
  warehouseLocation?: string;
}

type ItemFormValues = Omit<AddMaterialRequisitionItemPayload, 'description' | 'itemCode'> & {
  description?: string;
  itemCode?: string;
};

interface ClientItem extends AddMaterialRequisitionItemPayload {
  _key: string;
}

interface MaterialRequisitionFormProps {
  onSuccess: (result: MaterialRequisitionDetail) => void;
}

let _keyCounter = 0;
function nextKey(): string {
  _keyCounter += 1;
  return `item-${_keyCounter}`;
}

/**
 * 3-step stepper for creating a Material Requisition.
 *
 * Steps 1–2 are client-side only. On Step 3 submit:
 *   createDraft → add each item → submit with files → navigate
 */
export default function MaterialRequisitionForm({
  onSuccess,
}: MaterialRequisitionFormProps): React.ReactNode {
  const messageApi = useAppMessage();
  const [currentStep, setCurrentStep] = useState(0);

  const [step1Form] = Form.useForm<Step1Values>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const [details, setDetails] = useState<Step1Values | null>(null);
  const [items, setItems] = useState<ClientItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const projectsQuery = useAllProjects({}, true);
  const createMutation = useCreateMaterialRequisition();

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
    if (!v?.title?.trim() || !v.purpose?.trim()) {
      try {
        v = await step1Form.validateFields();
        setDetails(v);
      } catch {
        messageApi.warning('Complete requisition details before submitting');
        setCurrentStep(0);
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync({
        title: v.title.trim(),
        purpose: v.purpose.trim(),
        requiredByDate: v.requiredByDate
          ? v.requiredByDate.format('YYYY-MM-DD')
          : undefined,
        projectId: v.projectId,
        warehouseLocation: v.warehouseLocation?.trim() || undefined,
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

      messageApi.success('Material requisition submitted for approval');
      onSuccess(finalResult);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit material requisition', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  const projectOptions =
    projectsQuery.data?.data?.map((p) => ({
      value: p.id,
      label: p.projectCode ? `[${p.projectCode}] ${p.name}` : p.name,
    })) ?? [];

  const itemColumns: ColumnsType<ClientItem> = [
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
    },
    {
      title: 'Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 110,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | undefined) => v || '-',
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
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, row: ClientItem) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditItem(row)}
          />
          <Button
            type="text"
            size="small"
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
          { title: 'Requisition Details' },
          { title: 'Items' },
          { title: 'Attachments & Submit' },
        ]}
        style={{ maxWidth: 560, margin: '0 auto' }}
      />

      <div
        className="mx-auto w-full max-w-2xl flex flex-col gap-4"
        style={{ display: currentStep === 0 ? undefined : 'none' }}
        aria-hidden={currentStep !== 0}
      >
        <SectionCard title="Requisition Details" bodyClassName="px-5 py-4">
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
                placeholder="e.g. Site PPE restock — Block A"
                maxLength={200}
              />
            </Form.Item>

            <Form.Item
              name="purpose"
              label="Purpose"
              rules={[{ required: true, message: 'Provide a purpose' }]}
            >
              <Input.TextArea
                rows={4}
                maxLength={2000}
                showCount
                placeholder="Explain what the materials are needed for"
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
              name="warehouseLocation"
              label="Warehouse Location (optional)"
            >
              <Input
                placeholder="Which warehouse to draw from"
                maxLength={200}
              />
            </Form.Item>
          </Form>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="primary" onClick={() => void goToStep2()}>
            Continue to Items
          </Button>
        </div>
      </div>

      {currentStep === 1 ? (
        <div className="mx-auto w-full max-w-4xl flex flex-col gap-4">
          <SectionCard
            title="Items"
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
                <Form form={itemForm} layout="vertical">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <Form.Item
                      name="itemName"
                      label="Item Name"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item name="itemCode" label="Item Code">
                      <Input
                        placeholder="Catalogue or stock code"
                        maxLength={100}
                      />
                    </Form.Item>
                    <Form.Item
                      name="quantity"
                      label="Quantity"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <InputNumber min={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="unit"
                      label="Unit"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Input placeholder="pcs, kg, m, box, roll…" maxLength={50} />
                    </Form.Item>
                    <Form.Item
                      name="description"
                      label="Description"
                      className="md:col-span-2"
                    >
                      <Input maxLength={1000} />
                    </Form.Item>
                  </div>
                  <Space>
                    <Button type="primary" onClick={() => void saveItem()}>
                      {editingKey ? 'Update Item' : 'Add Item'}
                    </Button>
                    <Button onClick={cancelItemForm}>Cancel</Button>
                  </Space>
                </Form>
              </div>
            ) : null}

            <Table<ClientItem>
              rowKey="_key"
              size="small"
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              locale={{ emptyText: 'No items added yet' }}
            />
          </SectionCard>

          <div className="flex justify-between">
            <Button onClick={() => setCurrentStep(0)}>Back</Button>
            <Button type="primary" onClick={goToStep3}>
              Continue to Submit
            </Button>
          </div>
        </div>
      ) : null}

      {currentStep === 2 ? (
        <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
          <SectionCard title="Summary" bodyClassName="px-5 py-4">
            <Typography.Paragraph className="mb-2">
              <strong>{details?.title ?? step1Form.getFieldValue('title')}</strong>
            </Typography.Paragraph>
            <Typography.Paragraph
              type="secondary"
              className="whitespace-pre-wrap"
            >
              {details?.purpose ?? step1Form.getFieldValue('purpose')}
            </Typography.Paragraph>
            <Table<ClientItem>
              rowKey="_key"
              size="small"
              columns={itemColumns.filter((c) => c.key !== 'actions')}
              dataSource={items}
              pagination={false}
            />
            <Typography.Text type="secondary" className="mt-3 block">
              Approval chain: Discipline Lead → HR Officer → General Manager
            </Typography.Text>
          </SectionCard>

          <SectionCard title="Attachments" bodyClassName="px-5 py-4">
            <Typography.Paragraph type="secondary" className="mb-3">
              Upload drawings or specifications if relevant
            </Typography.Paragraph>
            <FileUploadInput
              files={files}
              onChange={setFiles}
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg"
              placeholder="Upload drawings or specifications if relevant"
            />
          </SectionCard>

          <div className="flex justify-between">
            <Button onClick={() => setCurrentStep(1)}>Back</Button>
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
