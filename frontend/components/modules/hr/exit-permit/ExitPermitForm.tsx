'use client';

import { useState, useMemo } from "react";
import { StepperForm } from "@/components/ui/StepperForm/StepperForm";
import type { Dayjs } from "dayjs";
import type { AddExitPermitItemPayload, ExitPermitDetail, ExitPermitDirection } from "@/lib/api/exit-permit.types";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Space, Table, Typography, Upload } from "antd";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import FormLayout from "@/components/ui/FormLayout/FormLayout";
import dayjs from "dayjs";
import { useDepartments } from "@/lib/query/org";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import { UserSelect } from "@/components/ui";
import { useAppMessage } from "@/hooks/use-app-message";
import { UploadOutlined } from "@ant-design/icons";
import { ColumnsType } from "antd/es/table";
import { tokens } from "@/lib/theme/tokens";
import { formatDisplayDate } from "@/lib/utils/date-format";
import EditOutlined from "@ant-design/icons/EditOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import FileUploadInput from "@/components/ui/FileUploadInput/FileUploadInput";
import { useCreateExitPermit } from "@/lib/query/exit-permit";
import { apiPost, apiPostForm } from "@/lib/api/client";
import { notifyApiError } from "@/lib/utils/notify-api-error";
import { useUserNameLookup } from "@/hooks/useUserNameLookup";


interface Step1Values {
    direction?: ExitPermitDirection;
    date?: Dayjs | null;
    departmentId?: string | null;
    employeeId?: string | null;
}

const canViewHr = useCanViewHr();

const departmentsQuery = useDepartments(
    {page: 1, limit: 100, isActive: true},
    true,
)


const departmentOptions = useMemo(
    ()=>
        (departmentsQuery.data?.data ?? []).map((department) => ({
            label: department.name,
            value: department.id,
        }))
    , [departmentsQuery.data?.data])


const DETAILS_FIELDS = ['direction'] as const;

interface ExitPermitItem extends AddExitPermitItemPayload {
    _key: string;
}

type ItemFormValues = Omit<
AddExitPermitItemPayload,
'isssue'
> & {
    issue?: string;
}

let keyCounter = 0;
function nextKey(): string {
    keyCounter += 1;
    return `item-${keyCounter}`;
}

interface ExitPermitFormProps {
    onSuccess: (result: ExitPermitDetail) => void;
}

export default function ExitPermitForm({onSuccess}: ExitPermitFormProps): React.ReactNode {

    const { t } = useEpcTranslation();
    const [detailsForm] = Form.useForm<Step1Values>();
    const [detailsSnapshot, setDetailsSnapshot] = useState<Step1Values>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [items, setItems] = useState<ExitPermitItem[]>([]);
    const messageApi = useAppMessage();
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [itemForm] = Form.useForm<ExitPermitItem>();
    const [showItemForm, setShowItemForm] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);

    function resetForm(): void {
        detailsForm.resetFields();
        setDetailsSnapshot({});
        setItems([]);
        setEditingKey(null);
        itemForm.resetFields();
        setShowItemForm(false);
        setFiles([]);
    }

    function captureDetailsSnapshot(): Step1Values {
        const values = detailsForm.getFieldsValue(true);
        setDetailsSnapshot(values);
        return values;
    }

    // Find department by id
    function findDepartment(id: string | null | undefined): string {
        if (!id) return '—';
        return (
            departmentOptions.find((option) => option.value === id)?.label || '—'
        );
    }

    // Find employee by id

    const lookupUserName = useUserNameLookup();

    function findEmployee(id: string | null | undefined): string {
        if (!id) return '—';
        return lookupUserName(id);
    }

    async function validateDetailsStep(): Promise<boolean> {
        try {
            await detailsForm.validateFields([...DETAILS_FIELDS]);
            captureDetailsSnapshot();
            return true;
        } catch{
            return false;
        }
    }

    async function validateItemsStep(): Promise<boolean>{
        if (items.length === 0){
            messageApi.warning(t('hr.validation.addItem'));
            return false
        }
        captureDetailsSnapshot();
        return true;
    }

    function cancelItemForm(): void {
        setShowItemForm(false);
        setEditingKey(null);
        itemForm.resetFields();
    }

    async function saveItem(): Promise<void> {
        try {
            const values = await itemForm.validateFields();
            const entry: ExitPermitItem = {
                _key: editingKey ?? nextKey(),
                itemName: values.itemName,
                issue: values.issue,
                quantity: Number(values.quantity),
                unit: values.unit,
            };
            if (editingKey) {
                setItems((prev) =>
                    prev.map((row) => (row._key === editingKey ? entry : row)),
                );
            }else{
                setItems((prev) => [...prev, entry]);
            }
            cancelItemForm();
        }catch{
            /* validation shown inline */
        }
    }

    function openEditItem(item: ExitPermitItem): void {
        setEditingKey(item._key);
        itemForm.setFieldsValue({
            itemName: item.itemName,
            issue: item.issue,
            quantity: item.quantity,
            unit: item.unit,
        });
    }

   
    function removeItem(key: string): void {
        setItems((prev) => prev.filter((row) => row._key !== key));
    }

    const itemColumns: ColumnsType<ExitPermitItem> = [
        {
            title: t('hr.table.itemName'),
            dataIndex: 'itemName',
            key: 'itemName',
            ellipsis: true,
        },
        {
            title: t('hr.table.issue'),
            dataIndex: 'issue',
            key: 'issue',
            width: 110,
            render: (value: string | undefined) => value || '—',
        },
        {
            title: t('hr.table.quantity'),
            dataIndex: 'quantity',
            key: 'quantity',
            width:70,
            align: 'right',
        },
        {
            title: t('hr.table.unit'),
            dataIndex: 'unit',
            key: 'unit',
            width: 80,
        },
        {
            title: t('hr.table.file'),
            dataIndex: 'file',
            key: 'file',
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: unknown, row: ExitPermitItem) => (
                <Space size={4}>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditItem(row)} style={{ borderRadius: 0 }} />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(row._key)} style={{ borderRadius: 0 }} />
                </Space>
            ),
        },
    ]

    const createMutation = useCreateExitPermit();

    const reviewItemColumns = itemColumns.filter(
        (column) => column.key !== 'actions',
    );

    async function handleSubmit(): Promise<void> {
       setFormError(null);
       const values = {
        ...detailsSnapshot,
        ...detailsForm.getFieldsValue(true),
       };
       if (!values.direction?.trim() || !values.date) {
        messageApi.warning(t('hr.validation.directionRequired'));
        return;
       }
       if (items.length === 0) {
        messageApi.warning(t('hr.validation.addItem'));
        return;
       }
       setSubmitting(true);
       try {
        const created = await createMutation.mutateAsync({
            direction: values.direction?.trim(),
            date: values.date?.format('YYYY-MM-DD'),
            departmentId: values.departmentId,
            employeeId: values.employeeId,
           
        });

        await Promise.all(
            items.map((item) => {
                const { _key: _unused, ...payload } = item;
                return apiPost<ExitPermitDetail>(
                    `/hr/exit-permit/${created.id}/items`,
                    payload,
                );
            }),
        );

        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        const finalResult = await apiPostForm<ExitPermitDetail>(
            `/hr/exit-permit/${created.id}/files`,
            formData,
        );

        messageApi.success(t('hr.messages.exitPermitSubmitted'));
        onSuccess(finalResult);
       } catch (error: unknown) {
        const message = t('hr.messages.exitPermitSubmitFailed');
        notifyApiError(error, message, messageApi);
        setFormError(message);
       }finally{
        setSubmitting(false);
       }
    }

    const steps = useMemo(
        () =>[
            {
                title: t('hr.section.requestDetails'),
                validate: () => validateDetailsStep(),
                content: (
                    <FormLayout
                          variant="pro"
                          title={t('hr.section.requestDetails')}
                          description={
                            t('pages.hr.exitPermit.detailsStepDescription')
                          }
                    >
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
                            <Input
                                placeholder={t('hr.placeholder.enterDirection')}
                                maxLength={200}
                            />
                        </Form.Item>
                        <Form.Item
                            name="requiredByDate"
                            label={t('hr.form.requiredByDate')}
                        >
                            <DatePicker
                                placeholder={t('hr.placeholder.selectDate')}
                                disabledDate={(date) => date.isBefore(dayjs(), 'day')}
                            />
                        </Form.Item>
                        <div className="erp-form-grid-2">
                            <Form.Item>
                                <Select
                                    allowClear
                                    showSearch
                                    loading={departmentsQuery.isLoading}
                                    placeholder={t('hr.placeholder.selectDepartment')}
                                    options={departmentOptions}
                                />
                            </Form.Item>
                            {canViewHr ? (
                                <Form.Item>
                                   <UserSelect
                                     allowClear
                                     placeholder={t('hr.placeholder.employee')}
                                   />
                                </Form.Item>
                            ): (
                                <Form.Item/>
                            )}

                        </div>
                    </FormLayout>
                )
            },{
                title: t('hr.section.items'),
                validate: () => validateItemsStep(),
                content:(
                    <FormLayout>
                        <div>
                            <Typography.Text
                              strong
                              style={{ display: 'block', marginBottom: 12 }}
                            >
                                {editingKey ? t('hr.form.editItem') : t('hr.form.newItem')}
                            </Typography.Text>
                            <Form
                               form={itemForm}

                            >
                                <div>
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
                                        name="issue"
                                        label={t('hr.form.issue')}
                                    >
                                        <Input.TextArea maxLength={1000} />
                                    </Form.Item>
                                    <Form.Item
                                        name="quantity"
                                        label={t('hr.form.quantity')}
                                    >
                                        <InputNumber min={0.001} className="w-full" />
                                    </Form.Item>
                                    <Form.Item
                                       name='unit'
                                       label={t('hr.form.unit')} 
                                    >
                                        <Input placeholder={t('hr.placeholder.enterUnit')} maxLength={50} />
                                    </Form.Item>
                                </div>
                            </Form>
                            <div>
                                <Button onClick={cancelItemForm} style={{ borderRadius: 0 }}>
                                    {t('hr.buttons.cancel')}
                                </Button>
                                <Button type="primary" onClick={() => void saveItem()} style={{ borderRadius: 0 }}>
                                        {editingKey ? t('common.save') : t('hr.buttons.addItem')}
                                </Button>
                            </div>
                        </div>
                        <Table<ExitPermitItem>
                            rowKey="_key"
                            size="small"
                            columns={itemColumns}
                            dataSource={items}
                            pagination={false}
                            locale={{ emptyText: t('hr.empty.noItems') }}
                            footer={
                                items.length > 0 ? () => (
                                    <div className="flex justify-end pr-2 text-sm font-medium">
                                        <span style={{ color: tokens.colorTextSecondary }}>
                                            {t('hr.form.itemCount', { count: items.length })}
                                        </span>
                                    </div>
                                ) : undefined
                            }
                        />
                    </FormLayout>
                )
            },{
                title: t('hr.section.reviewSubmit'),
                content:(
                    <div>
                        <FormLayout
                          variant="pro"
                          title={t('hr.section.reviewSubmit')}
                          description={t('pages.hr.exitPermit.reviewStepDescription')}
                        >
                            <div className="erp-form-grid-2">
                                <ReviewItem label={t('hr.form.direction')} value={detailsSnapshot.direction?.trim() || '—'} />
                                <ReviewItem label={t('hr.form.issue')} value={detailsSnapshot.date? formatDisplayDate('DD/MM/YYYY') : '—'} />
                                <ReviewItem label={t('hr.form.department')} value={findDepartment(detailsSnapshot.departmentId ?? null) || '—'} />
                                <ReviewItem label={t('hr.form.employee')} value={findEmployee(detailsSnapshot.employeeId ?? null) || '—'} />
                                <ReviewItem label={t('hr.form.itemCount', { count: items.length })} value={t('hr.form.itemCount', { count: items.length })} />
                            </div>
                        </FormLayout>
                        <FormLayout
                          variant="pro"
                          title={t('hr.section.items')}
                          description={t('pages.hr.exitPermit.itemsStepDescription')}
                        >
                            <Table<ExitPermitItem>
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
                          title={t('hr.section.supportingDocuments')}
                          description={t('pages.hr.exitPermit.supportingDocumentsStepDescription')}
                        >
                            <FileUploadInput
                                files={files}
                                onChange={setFiles}
                                multiple
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg"
                                placeholder={t('hr.placeholder.selectFile')}
                            />
                        </FormLayout>
                    </div>
                )
            }
        ],
        [
            t,
            showItemForm,
            editingKey,
            itemForm,
            itemColumns,
            reviewItemColumns,
            items,
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
                <Alert
                    type="error"
                    showIcon
                    title={formError}
                    className = "mb-4"
                    closable={{onClose: () => setFormError(null)}}
                />
            ): null}
            <StepperForm
                steps={steps}
                onSubmit={handleSubmit}
                onReset={resetForm}
                isSubmitting={submitting}
                contentVariant="sections"
                submitLabel={t('hr.buttons.submitRequest')}
            />
        </Form>
    )
}

function ReviewItem({
    label,
    value,
}:{
    label: string;
    value: string;
}) : React.ReactNode {
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