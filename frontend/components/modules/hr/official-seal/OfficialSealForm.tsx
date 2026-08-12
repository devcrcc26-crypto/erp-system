'use client';
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import type { OfficialSealDetail, OfficialSealUrgency } from "@/lib/api/official-seal.types";
import { Button, DatePicker, Form, Input, Select, Typography } from "antd";
import type dayjs from "dayjs";
import { SectionCard } from "../shared/hr-page-chrome";
import { useMemo, useState } from "react";
import { notifyApiError } from "@/lib/utils/notify-api-error";
import { useSubmitOfficialSeal } from "@/lib/query/official-seal";
import { useAppMessage } from "@/hooks/use-app-message";
import { OFFICIAL_SEAL_URGENCY_OPTIONS } from "@/lib/utils/official-seal";
import FileUploadInput from "@/components/ui/FileUploadInput/FileUploadInput";

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
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const submitMutation = useSubmitOfficialSeal();
    const messageApi = useAppMessage();

    const urgencyOptions = useMemo(
        () =>
            OFFICIAL_SEAL_URGENCY_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`hr.urgency.${option.value}`),
            })),
        [t],
    );

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
                files: selectedFiles.length > 0 ? selectedFiles : undefined,
            });

            messageApi.success(
                result.directApproved || (result.status === "APPROVED" && !result.approvalRequestId)
                    ? t('hr.messages.requestApproved')
                    : t('hr.messages.requestSubmitted')
            )
            onSuccess(result);

        } catch (error: unknown) {
            notifyApiError(error, t('hr.messages.failedToSubmitOfficialSeal'), messageApi);
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
                        label={t('hr.form.description')}
                        rules={[{ required: true, message: t('hr.placeholder.enterOfficialSealDescription') }]}
                    >
                        <Input.TextArea rows={4} maxLength={1000} placeholder={t('hr.placeholder.enterOfficialSealDescription')} />
                    </Form.Item>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <Form.Item
                            name="dateNeeded"
                            label={t('hr.labels.dateNeeded')}
                            rules={[{ required: true, message: t('hr.validation.selectDate') }]}
                        >
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="urgency"
                            label={t('hr.labels.urgency')}
                            rules={[{ required: true, message: t('hr.validation.selectUrgency') }]}
                        >
                            <Select options={urgencyOptions} />
                        </Form.Item>
                    </div>
                </Form>
            </SectionCard>

            <SectionCard title={t('hr.section.documentToSeal')} bodyClassName="px-5 py-4">
                <Typography.Paragraph
                    type="secondary"
                    style={{ marginBottom: 12, fontSize: 13 }}
                >
                    {t('hr.messages.documentToSealHint')}
                </Typography.Paragraph>
                <FileUploadInput
                    files={selectedFiles}
                    onChange={setSelectedFiles}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    multiple
                    disabled={submitting || submitMutation.isPending}
                    placeholder={t('hr.buttons.chooseDocumentOptional')}
                />
            </SectionCard>

            <div className="flex justify-end">
                <Button
                    type="primary"
                    loading={submitting || submitMutation.isPending}
                    onClick={() => void handleSubmit()}
                >
                    {t('hr.buttons.submitRequest')}
                </Button>
            </div>
        </div>
    )
}
