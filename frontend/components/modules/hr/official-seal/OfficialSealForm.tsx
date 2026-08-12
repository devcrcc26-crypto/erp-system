'use client';
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import type { OfficialSealDetail, OfficialSealUrgency } from "@/lib/api/official-seal.types";
import { Button, DatePicker, Form, Input, Select } from "antd";
import type dayjs from "dayjs";
import { SectionCard } from "../shared/hr-page-chrome";
import { useState } from "react";
import { notifyApiError } from "@/lib/utils/notify-api-error";
import { useSubmitOfficialSeal } from "@/lib/query/official-seal";
import { useAppMessage } from "@/hooks/use-app-message";

interface FormValues {
    description: string;
    urgency: OfficialSealUrgency;
    dateNeeded: dayjs.Dayjs;
}

interface OfficialSealFormProps {
    onSuccess: (result: OfficialSealDetail) => void;
}

export default function OfficialSealForm({
    onSuccess,
}: OfficialSealFormProps): React.ReactNode {

    const { t } = useEpcTranslation();
    const [form] = Form.useForm<FormValues>();
    const [submitting, setSubmitting] = useState(false);
    const submitMutation = useSubmitOfficialSeal();
    const messageApi = useAppMessage();

    async function handleSubmit(): Promise<void> {

        let values: FormValues;

        try {
            values = await form.validateFields();
        } catch {
            return;
        }

        setSubmitting(true);

        try {
            const result = await submitMutation.mutateAsync({
                description: values.description.trim(),
                urgency: values.urgency,
                dateNeeded: values.dateNeeded.format('YYYY-MM-DD'),
            });

            messageApi.success(
                result.directApproved || (result.status === "APPROVED" && !result.approvalRequestId)
                    ? t('hr.messages.requestApproved')
                    : t('hr.messages.requestSubmitted')
            )
            onSuccess(result);

        } catch (error: unknown) {
            notifyApiError(error, 'Failed to submit official seal request', messageApi);
        } finally {
            setSubmitting(false);
        }

    }


    return (
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
            <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
                <Form form={form} layout="vertical" initialValues={{ urgency: 'MINOR' }}>
                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[{ required: true, message: 'Enter description' }]}
                    >
                        <Input.TextArea rows={4} maxLength={1000} placeholder="Enter description" />
                    </Form.Item>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <Form.Item
                            name="dateNeeded"
                            label="Date needed"
                            rules={[{ required: true, message: 'Select date' }]}
                        >
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="urgency"
                            label="Urgency"
                            rules={[{ required: true, message: 'Select urgency' }]}
                        >
                            <Select options={[
                                { value: 'MINOR', label: 'Minor' },
                                { value: 'NORMAL', label: 'Normal' },
                                { value: 'URGENT', label: 'Urgent' },
                                { value: 'CRITICAL', label: 'Critical' },
                            ]} />
                        </Form.Item>
                    </div>
                </Form>
            </SectionCard>
            <div className="flex justify-end">
                <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
                    {t('hr.buttons.submitRequest')}
                </Button>
            </div>
        </div>
    )
}