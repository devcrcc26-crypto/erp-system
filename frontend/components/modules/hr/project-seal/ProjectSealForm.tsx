"use client";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { SectionCard } from "../shared/hr-page-chrome";
import { Button, DatePicker, Form, Input, Select, Typography } from "antd";
import { ProjectSealUrgency } from "@/lib/api/project-seal.types";
import dayjs from "dayjs";
import { ProjectSealDetail } from "@/lib/api/project-seal.types";
import { useMemo, useState } from "react";
import { PROJECT_SEAL_URGENCY_OPTIONS } from "@/lib/utils/project-seal";
import FileUploadInput from "@/components/ui/FileUploadInput/FileUploadInput";
import { useSubmitProjectSeal } from "@/lib/query/project-seal";
import { useAppMessage } from "@/hooks/use-app-message";
import { notifyApiError } from "@/lib/utils/notify-api-error";


interface ProjectSealFormProps {
    onSuccess: (result: ProjectSealDetail) => void;
}

interface FormValues {
    description: string;
    urgency: ProjectSealUrgency;
    dateNeeded: dayjs.Dayjs;
}

export default function ProjectSealForm({
    onSuccess,
}: ProjectSealFormProps): React.ReactNode {

    const { t } = useEpcTranslation();
    const [form] = Form.useForm<FormValues>();
    const [submitting, setSubmitting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const submitMutation = useSubmitProjectSeal();
    const messageApi = useAppMessage();


    const UrgencyOptions = useMemo(
        () =>
            PROJECT_SEAL_URGENCY_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`hr.urgency.${option.value}`),
            })),
        [t],
    );

    async function handleSubmit(): Promise<void> {
        let values: FormValues;
        try {
            values = await form.validateFields();
        } catch (error) {
            return;
        }

        setSubmitting(true);

        try{
            const result = await submitMutation.mutateAsync({
                description: values.description,
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
        }catch(error: unknown) {
            notifyApiError(error, t('hr.messages.failedToSubmitProjectSeal'), messageApi);
        } finally {
            setSubmitting(false);
        }
    }

    return(
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
            <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
                <Form form={form} layout="vertical" initialValues={{urgency: 'MINOR'}}>
                    <Form.Item
                        name="description"
                        label={t('hr.form.description')}
                        rules={[{ required: true, message: t('hr.placeholder.enterProjectSealDescription') }]}
                    >
                        <Input.TextArea rows={4} maxLength={1000} placeholder={t('hr.placeholder.enterProjectSealDescription')} />
                    </Form.Item>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <Form.Item
                            name="dateNeeded"
                            label={t('hr.form.dateNeeded')}
                            rules={[{ required: true, message: t('hr.placeholder.selectProjectSealDateNeeded') }]}
                        >
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            name="urgency"
                            label={t('hr.form.urgency')}
                            rules={[{ required: true, message: t('hr.placeholder.selectProjectSealUrgency') }]}
                        >
                            <Select options={UrgencyOptions} />
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
                    placeholder={t('hr.buttons.chooseDocumentOptional')}
                />
            </SectionCard>
            <div className="flex justify-end">
                <Button
                    type="primary"
                    onClick={() => void handleSubmit()}
                >
                    {t('hr.buttons.submitRequest')}
                </Button>
            </div>
        </div>
    )
}