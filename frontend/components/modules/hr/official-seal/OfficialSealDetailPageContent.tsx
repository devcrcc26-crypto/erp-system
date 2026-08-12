"use client";
import {ConfirmDialog, StatusBadge } from "@/components/ui";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCancelOfficialSeal, useIssueOfficialSeal, useOfficialSeal } from "@/lib/query/official-seal";
import { useCurrentUser } from "@/lib/query/profile";
import { useMemo, useRef, useState } from "react";
import { MetaItem, SectionCard, SummaryStrip } from "../shared/hr-page-chrome";
import { tokens } from "@/lib/theme/tokens";
import {
    formatOfficialSealEmployeeName,
    formatOfficialSealStatus,
    formatOfficialSealUrgency,
    officialSealStatusVariant,
} from "@/lib/utils/official-seal";
import { Alert, Button, Skeleton, Tag, Typography } from "antd";
import { formatProjectDate } from "@/lib/utils/project-display";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { notifyApiError } from "@/lib/utils/notify-api-error";
import { useAppMessage } from "@/hooks/use-app-message";
import { ApiRequestError } from "@/lib/api/errors";
import ApprovalTierTimeline from "../../approvals/ApprovalTierTimeline";
import { ApprovalTier } from "@/lib/api/approvals.types";
import { OFFICIAL_SEAL_FILE_ACCEPT } from "@/lib/constants/official-seal-upload";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import AttachmentDownloadList from "@/components/ui/FileUploadInput/AttachmentDownloadList";


export default function OfficialSealDetailPageContent({
  sealId,
}: {
  sealId: string;
}): React.ReactNode {
    const { t } = useEpcTranslation();
    const router = useRouter();
    const canViewHr = useCanViewHr();
    const currentUser = useCurrentUser();
    const detailQuery = useOfficialSeal(sealId);
    const cancelMutation = useCancelOfficialSeal(sealId);
    const messageApi = useAppMessage();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | undefined>();
    const issueMutation = useIssueOfficialSeal(sealId);
    const seal = detailQuery.data;
    const showIssueSeal = canViewHr && seal?.status === "APPROVED";
    const [confirmCancel, setConfirmCancel] = useState(false);
    const isOwner = Boolean(seal) && seal?.employeeId === currentUser.data?.id;
    const canCancel = isOwner && (seal?.status === 'DRAFT' || seal?.status === 'SUBMITTED');
    const isDirectApproved = Boolean(seal?.directApproved);

    const tiers = useMemo(
        () => (seal?.approvalRequest?.tiers ?? []) as ApprovalTier[],
        [seal?.approvalRequest?.tiers],
    );
    async function handleCancel(): Promise<void> {
        try {
            await cancelMutation.mutateAsync();
            messageApi.success(t('hr.messages.officialSealCancelled'));
            setConfirmCancel(false);
        } catch (error: unknown) {
            notifyApiError(error, t('hr.messages.failedToCancelOfficialSeal'), messageApi);
        }
    }

    async function handleIssueSeal(file?: File): Promise<void> {
        try {
            await issueMutation.mutateAsync(file);
            setSelectedFile(undefined);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            messageApi.success(t('hr.messages.officialSealIssued'));
        } catch (error: unknown) {
            notifyApiError(error, t('hr.messages.failedToIssueSeal'), messageApi);
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
                        : t('hr.messages.officialSealRequestNotFound')
                }
                action={
                    <Button onClick={() => router.push('/hr/official-seal')}>
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
                onClick={() => router.push('/hr/official-seal')}
            >
                {t('hr.buttons.back')}
            </Button>
            {canCancel ? (
                <Button
                danger
                className="ml-auto"
                onClick={() => setConfirmCancel(true)}
            >
                {t('hr.buttons.cancelRequest')}
            </Button>
            ) : null}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            <div className="flex flex-col gap-4 min-w-0">
                <div
                    className="rounded-lg overflow-hidden"
                    style={{
                        background: tokens.colorCardBg,
                        border: `1px solid ${tokens.colorBorder}`,
                    }}
                >
                    <div className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: tokens.colorTextTertiary }}
                            >
                                {seal.requestNumber}
                            </span>
                            <span style={{ color: tokens.colorBorder }}>|</span>
                            <StatusBadge
                                label={formatOfficialSealStatus(seal.status, t)}
                                variant={officialSealStatusVariant(seal.status)}
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
                            {t('hr.labels.officialSeal')} — {seal.description}
                        </h2>
                        <p
                            className="mt-1 text-sm m-0"
                            style={{ color: tokens.colorTextSecondary }}
                        >
                            {formatOfficialSealEmployeeName(seal.employee)}
                            {seal.submittedAt
                                ? ` | ${t('hr.labels.submitted')} ${formatProjectDate(seal.submittedAt)}`
                                : null}
                        </p>

                    </div>
                </div>
                <SummaryStrip 
                    items={[
                        {label: t('hr.labels.urgency'), value: formatOfficialSealUrgency(seal.urgency, t)},
                        {label: t('hr.labels.dateNeeded'), value: formatProjectDate(seal.dateNeeded ?? null)},
                        {
                            label: t('hr.labels.issued'),
                            value: seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-',
                        },
                        {
                            label: t('hr.labels.issuedBy'),
                            value: formatOfficialSealEmployeeName(seal.issuer),
                        }
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
                            {formatOfficialSealUrgency(seal.urgency, t)}
                        </MetaItem>
                        {
                            seal.completedAt ? (
                            <MetaItem label={t('hr.labels.completed')}>
                                {formatProjectDate(seal.completedAt)}
                            </MetaItem>
                            ) : null
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
                            accept={OFFICIAL_SEAL_FILE_ACCEPT}
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
                </SectionCard>
                ) : null}
                {seal.sealedDocument ? (
                    <SectionCard title={t('hr.section.sealedProof')} bodyClassName="px-5 py-4">
                        <AttachmentDownloadList
                            documents={[seal.sealedDocument]}
                            emptyLabel={t('hr.empty.noAttachments')}
                        />
                    </SectionCard>
                ):null}
            </div>      

            <div className="min-w-0">
                <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-4 py-4">
                    {isDirectApproved ? (
                        <Typography.Text type="secondary">
                            {t('hr.messages.directApprovalNoChain')}
                        </Typography.Text>
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
            title={t('hr.dialog.cancelOfficialSealTitle')}
            description={t('hr.dialog.cancelOfficialSealDesc')}
            confirmLabel={t('hr.buttons.cancelRequest')}
            danger
            confirmLoading={cancelMutation.isPending}
            onConfirm={() => void handleCancel()}
            onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
