"use client";
import {ConfirmDialog, StatusBadge } from "@/components/ui";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCancelOfficialSeal, useIssueOfficialSeal, useOfficialSeal } from "@/lib/query/official-seal";
import { useCurrentUser } from "@/lib/query/profile";
import { useMemo, useRef, useState } from "react";
import { MetaItem, SectionCard, SummaryStrip } from "../shared/hr-page-chrome";
import { tokens } from "@/lib/theme/tokens";
import { formatOfficialSealEmployeeName, formatOfficialSealStatus } from "@/lib/utils/official-seal";
import { officialSealStatusVariant } from "@/lib/utils/official-seal";
import { Alert, Button, Skeleton, Tag, Typography } from "antd";
import { formatProjectDate } from "@/lib/utils/project-display";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { notifyApiError } from "@/lib/utils/notify-api-error";
import { useAppMessage } from "@/hooks/use-app-message";
import { ApiRequestError } from "@/lib/api/errors";
import ApprovalTierTimeline from "../../approvals/ApprovalTierTimeline";
import { ApprovalTier } from "@/lib/api/approvals.types";


export default function OfficialSealDetailPageContent({
  sealId,
}: {
  sealId: string;
}): React.ReactNode {
    const { t } = useEpcTranslation();
    const router = useRouter();
    const currentUser = useCurrentUser();
    const detailQuery = useOfficialSeal(sealId);
    const cancelMutation = useCancelOfficialSeal(sealId);
    const messageApi = useAppMessage();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | undefined>();
    const issueMutation = useIssueOfficialSeal(sealId);
    const seal = detailQuery.data;
    const showIssueSeal = seal?.status === "APPROVED";
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
            messageApi.success('Official seal request cancelled');
            setConfirmCancel(false);
        } catch (error: unknown) {
            notifyApiError(error, 'Failed to cancel request', messageApi);
        }
    }

    async function handleIssueSeal(file?: File): Promise<void> {
        try {
            await issueMutation.mutateAsync(file);
            messageApi.success('Official seal issued');
        } catch (error: unknown) {
            notifyApiError(error, 'Failed to issue seal', messageApi);
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
                        : 'Official seal request not found'
                }
                action={
                    <Button onClick={() => router.push('/hr/official-seal')}>
                        Back to list
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
                Back
            </Button>
            {canCancel ? (
                <Button
                danger
                className="ml-auto"
                onClick={() => setConfirmCancel(true)}
            >
                Cancel Request
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
                                label={formatOfficialSealStatus(seal.status)}
                                variant={officialSealStatusVariant(seal.status)}
                            />
                            {isDirectApproved ? (
                                <Tag color="blue">Direct approval</Tag>
                            ) : null}
                            {seal?.sealedDocument?.id ? (
                                <Tag color="green">Seal attached</Tag>
                            ) : null}
                        </div>
                        <h2
                            className="text-lg font-semibold leading-snug m-0"
                            style={{ color: tokens.colorTextPrimary }}
                        >
                            Official Seal - {seal.description}
                        </h2>
                        <p
                            className="mt-1 text-sm m-0"
                            style={{ color: tokens.colorTextSecondary }}
                        >
                            {formatOfficialSealEmployeeName(seal?.employee)}
                            {seal?.submittedAt
                                ? ` | Submitted ${formatProjectDate(seal?.submittedAt)}`
                                : null}
                        </p>

                    </div>
                </div>
                <SummaryStrip 
                    items={[
                        {label: t('hr.labels.urgency'), value: seal.urgency},
                        {label: t('hr.labels.dateNeeded'), value: formatProjectDate(seal.dateNeeded ?? null)},
                        {
                            label: 'Issued',
                            value: seal?.issuedAt ? formatProjectDate(seal?.issuedAt) : '-',
                        },
                        {
                            label: 'Issued by',
                            value: formatOfficialSealEmployeeName(seal?.issuer),
                        }
                    ]} 
                />
                 <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <MetaItem label="Description">
                            <p className="whitespace-pre-wrap m-0">
                                {seal?.description}
                            </p>
                        </MetaItem>
                        <MetaItem label="Date needed">
                            {formatProjectDate(seal?.dateNeeded ?? null)}
                        </MetaItem>
                        <MetaItem label="Urgency">{seal?.urgency}</MetaItem>
                        {
                            seal?.completedAt ? (
                            <MetaItem label="Completed">
                                {formatProjectDate(seal?.completedAt)}
                            </MetaItem>
                            ) : null
                        }
                    </div>
                </SectionCard>
                {showIssueSeal? <SectionCard title='Issue seal' bodyClassName="px-5 py-4">
                        <Alert type="info" showIcon className="mb-4" title="This request has been approved. Please issue the seal."/>
                        <input type="file" ref={fileInputRef} hidden accept="image/*,application/pdf" onChange={(e) => setSelectedFile(e.target.files?.[0])}/>
                        <div className="flex gap-2">
                            <Button onClick={()=> fileInputRef.current?.click()}>Choose document (optional)</Button>
                            <Button 
                                type="primary" loading={issueMutation.isPending}
                                onClick={() => void handleIssueSeal(selectedFile)}
                            >
                                Issue Seal
                            </Button>
                        </div>
                </SectionCard> : null}
                {seal?.sealedDocument ? (
                    <SectionCard title={t('hr.table.seal')} bodyClassName="px-5 py-4">
                        {seal.sealedDocument?.name ?? 'Document attached'}
                    </SectionCard>
                ):null}
            </div>      

            <div className="min-w-0">
                <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-4 py-4">
                    {isDirectApproved ? (
                        <Typography.Text type="secondary">
                            Approved directly - no approval required
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
            title="Cancel request?"
            description="This will cancel the official seal request and any open approval request."
            confirmLabel="Cancel Request"
            danger
            confirmLoading={cancelMutation.isPending}
            onConfirm={() => void handleCancel()}
            onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}