"use client";

import { Alert, Button, message, Skeleton, Tag, Typography } from "antd";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { useCancelProjectSeal, useIssueProjectSeal, useProjectSeal } from "@/lib/query/project-seal";
import { useCurrentUser } from "@/lib/query/profile";
import { useMemo, useRef, useState } from "react";
import { MetaItem, SectionCard, SummaryStrip } from "../shared/hr-page-chrome";
import { formatProjectSealEmployeeName, formatProjectSealStatus, formatProjectSealUrgency, projectSealStatusVariant } from "@/lib/utils/project-seal";
import { formatProjectDate } from "@/lib/utils/project-display";
import { tokens } from "@/lib/theme/tokens";
import { ConfirmDialog, StatusBadge } from "@/components/ui";
import AttachmentDownloadList from "@/components/ui/FileUploadInput/AttachmentDownloadList";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import { PROJECT_SEAL_FILE_ACCEPT } from "@/lib/constants/project-seal-upload";
import { notifyApiError } from "@/lib/utils/notify-api-error";
import { useAppMessage } from "@/hooks/use-app-message";
import { ApprovalTier } from "@/lib/api/approvals.types";
import { ApiRequestError } from "@/lib/api/errors";
import ApprovalTierTimeline from "../../approvals/ApprovalTierTimeline";

export default function ProjectSealDetailPageContent({
    sealId,
}: {
    sealId: string;
}): React.ReactNode {


    const { t } = useEpcTranslation();
    const router = useRouter();
    const currentUser = useCurrentUser();
    const detailQuery = useProjectSeal(sealId);
    const cancelMutation = useCancelProjectSeal(sealId);
    const seal = detailQuery.data;
    const isOwner = Boolean(seal) && seal?.employeeId === currentUser.data?.id;
    const [confirmCancel, setConfirmCancel] = useState(false);
    const canCancel = isOwner && (seal?.status === 'DRAFT' || seal?.status === 'SUBMITTED');
    const isDirectApproved = Boolean(seal?.directApproved);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const issueMutation = useIssueProjectSeal(sealId);
    const [selectedFile, setSelectedFile] = useState<File | undefined>();
    const canViewHr = useCanViewHr();
    const showIssueSeal = canViewHr && seal?.status === "APPROVED";
    const messageApi = useAppMessage();


    async function handleIssueSeal(file?: File): Promise<void> {
        try {
            await issueMutation.mutateAsync(file);
            setSelectedFile(undefined);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            messageApi.success(t('hr.messages.projectSealIssued'));
        } catch (error: unknown) {
            notifyApiError(error, t('hr.messages.failedToIssueSeal'), messageApi);
        }
    }

    const tiers = useMemo(
        () => (seal?.approvalRequest?.tiers ?? []) as ApprovalTier[],
        [seal?.approvalRequest?.tiers],
    );

    async function handleCancel(): Promise<void> {
        try {
            await cancelMutation.mutateAsync();
            messageApi.success(t('hr.messages.projectSealCancelled'));
            setConfirmCancel(false);
        } catch (error: unknown) {
            notifyApiError(error, t('hr.messages.failedToCancelProjectSeal'), messageApi);
        }
    }
        
    if (detailQuery.isLoading) {
        return <Skeleton active paragraph={{ rows: 8 }} />;
    }

    if (detailQuery.isError || !seal) {
        return (
            <Alert
                type="error"
                showIcon
                title={
                    detailQuery.error instanceof ApiRequestError
                        ? detailQuery.error.message
                        : t('hr.messages.projectSealRequestNotFound')
                }
                action={
                    <Button onClick={() => router.push('/hr/project-seal')}>
                        {t('hr.buttons.backToList')}
                    </Button>
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Button
                    type="text"
                    icon={<ArrowLeft size={16} />}
                    onClick={() => router.push('/hr/project-seal')}
                >
                    {t('hr.buttons.back')}
                </Button>
                {canCancel ? (
                    <Button
                    danger
                    className="ml-auto"
                    onClick={() => setConfirmCancel(true)}
                    >
                        {t('hr.buttons.cancel')}
                    </Button>
                ) : null}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
                <div className="flex flex-col gap-4 min-w-0">
                    <div
                        className="rounded-lg overflow-hidden"
                        style={{
                            backgroundColor: tokens.colorCardBg,
                            border: `1px solid ${tokens.colorBorder}`,
                        }}
                    >
                        <div className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span
                                className="text-xs font-semibold uppercase tracking-wide"
                                style={{ color: tokens.colorTextTertiary }}
                                >
                                    {seal?.requestNumber}
                                </span>
                                <span style={{ color: tokens.colorBorder }}>|</span>
                                <StatusBadge
                                    label={formatProjectSealStatus(seal.status, t)}
                                    variant={projectSealStatusVariant(seal.status)}
                                />
                                {isDirectApproved ? (
                                    <Tag color="blue">{t('hr.labels.directApproval')}</Tag>
                                ) : null}
                                {seal.sealedDocument?.id ? (
                                    <Tag color="green">{t('hr.labels.sealAttached')}</Tag>
                                ) : null}
                                {(seal.documents?.length ?? 0) > 0 ? (
                                    <Tag color="blue">{t('hr.labels.documentToSealAttached')}</Tag>
                                ) : null}
                            </div>
                            <h2
                                className="text-lg font-semibold leading-snug m-0"
                                style={{ color: tokens.colorTextPrimary }}
                            >
                                {t('hr.labels.projectSeal')} — {seal.description}
                            </h2>
                            <p 
                                className="whitespace-pre-wrap m-0"
                                style={{ color: tokens.colorTextSecondary }}
                            >
                                {formatProjectSealEmployeeName(seal.employee)}
                                {seal.submittedAt
                                    ? ` | ${t('hr.labels.submitted')} ${formatProjectDate(seal.submittedAt)}`
                                    : null}
                            </p>
                        </div>
                    </div>
                    <SummaryStrip
                        items={[
                            {label: t('hr.labels.urgency'), value: formatProjectSealUrgency(seal.urgency, t)},
                            {label: t('hr.labels.dateNeeded'), value: formatProjectDate(seal.dateNeeded ?? null)},
                            {label: t('hr.labels.issued'), value: seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-'},
                            {label: t('hr.labels.issuedBy'), value: formatProjectSealEmployeeName(seal.issuer)},
                        ]}
                    />
                    <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <MetaItem label={t('hr.form.description')}>
                                <p className="whitespace-pre-wrap m-0">
                                    {seal.description}
                                </p>
                            </MetaItem>
                            <MetaItem label={t('hr.labels.dateNeeded')}>
                                    {formatProjectDate(seal.dateNeeded ?? null)}
                            </MetaItem>
                            <MetaItem label={t('hr.labels.urgency')}>
                                <p className="m-0">
                                    {formatProjectSealUrgency(seal.urgency, t)}
                                </p>
                            </MetaItem>
                            {seal.completedAt ? (
                                <MetaItem label={t('hr.labels.completedAt')}>
                                    <p className="m-0">
                                        {formatProjectDate(seal.completedAt)}
                                    </p>
                                </MetaItem>) : null
                            }
                        </div>
                    </SectionCard>
                    {(seal.documents?.length ?? 0) > 0 ? (
                        <SectionCard title={t('hr.section.documentToSeal')} bodyClassName="px-5 py-4">
                            <AttachmentDownloadList
                                documents={seal.documents}
                                emptyLabel={t('hr.empty.noAttachments')}
                            />
                        </SectionCard>
                    ) : null}

                    {showIssueSeal ? (
                        <SectionCard title={t('hr.section.issueSeal')} bodyClassName="px-5 py-4">
                            <Alert
                                type="info"
                                showIcon
                                className="mb-4"
                                title={t('hr.messages.issueSealApprovedInfo')}
                                description={
                                    (seal.documents?.length ?? 0) > 0
                                        ? t('hr.messages.issueSealDownloadHint')
                                        : undefined
                                }
                            />
                            <input 
                                type="file"
                                ref={fileInputRef}
                                hidden
                                accept={PROJECT_SEAL_FILE_ACCEPT}
                                onChange={(e) => setSelectedFile(e.target.files?.[0])}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <Button onClick={() => fileInputRef.current?.click()}>
                                    {t('hr.buttons.chooseDocumentOptional')}
                                </Button>
                                {selectedFile ? (
                                    <Typography.Text type="secondary">
                                        {selectedFile.name}
                                    </Typography.Text>
                                ) : null}
                                <Button 
                                    type="primary"
                                    loading={issueMutation.isPending}
                                    onClick={() => void handleIssueSeal(selectedFile)}
                                >
                                    {t('hr.buttons.issueSeal')}
                                </Button>
                            </div>
                        </SectionCard>) : null}
                        {seal.sealedDocument ? (
                            <SectionCard title={t('hr.section.sealedProof')} bodyClassName="px-5 py-4">
                                <AttachmentDownloadList
                                    documents={[seal.sealedDocument]}
                                    emptyLabel={t('hr.empty.noAttachments')}
                                />
                            </SectionCard>
                        ) : null}
                    </div>
                    <div className="min-w-0">
                        <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-5 py-4">
                            {isDirectApproved ? (
                                <div className="flex flex-col gap-2">
                                    <Typography.Text type="secondary">
                                        {t('hr.labels.directApproval')}
                                    </Typography.Text>
                                </div>
                            ) : tiers.length > 0 ? (
                                <ApprovalTierTimeline
                                    tiers={tiers}
                                    currentTier={seal.approvalRequest?.currentTier ?? 1}
                                />
                            ) : (
                                <Typography.Text type="secondary">
                                    {t('hr.empty.noApprovalChain')}
                                </Typography.Text>
                            )}
                        </SectionCard>
                    </div>
                </div>
                <ConfirmDialog
                    open={confirmCancel}
                    title={t('hr.dialog.cancelProjectSealTitle')}
                    description={t('hr.dialog.cancelProjectSealDesc')}
                    confirmLabel={t('hr.buttons.cancelRequest')}
                    danger
                    confirmLoading={cancelMutation.isPending}
                    onConfirm={() => void handleCancel()}
                    onCancel={() => setConfirmCancel(false)}
                />
            </div>
    )
}