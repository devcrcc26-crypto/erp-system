"use client";

import { StatusBadge } from "@/components/ui";
import { tokens } from "@/lib/theme/tokens";
import { formatDisplayDate } from "@/lib/utils/date-format";
import { formatProjectDate } from "@/lib/utils/project-display";
import { formatProjectSealEmployeeName, formatProjectSealStatus, formatProjectSealUrgency, projectSealStatusVariant } from "@/lib/utils/project-seal";
import { Alert, Skeleton, Tag } from "antd";
import { MetaItem, SectionCard, SummaryStrip } from "../../hr/shared/hr-page-chrome";
import AttachmentDownloadList from "@/components/ui/FileUploadInput/AttachmentDownloadList";
import { useProjectSeal } from "@/lib/query/project-seal";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { ApiRequestError } from "@/lib/api/errors";

export default function ProjectSealDetail({
    sourceId,
}: {
    approvalRequestId: string;
    sourceId: string;
}): React.ReactNode {
    const { t } = useEpcTranslation();
    const detailQuery = useProjectSeal(sourceId);
    const seal = detailQuery.data;

    if(detailQuery.isLoading && !seal) {
        return (
            <div className="rounded-none p-6" style={{ 
                background: tokens.colorCardBg, 
                border: `1px solid ${tokens.colorBorder}`,
            }}>
                <Skeleton active paragraph={{ rows: 8 }} />
            </div>
        );
    }

    if(detailQuery.isError || !seal) {
        return (
            <Alert
                type="error"
                showIcon
                message={
                    detailQuery.error instanceof ApiRequestError
                        ? detailQuery.error.message
                        : t('hr.messages.projectSealNotFound')
                }
            />
        );
    }


    const sealedDocumentLink = seal.sealedDocument?.id ? (
        seal.sealedDocument.name
    ) : '-';

    return(
        <div className="flex flex-col gap-3">
            <div className="rounded-none overflow-hidden"
                style={{
                    background: tokens.colorCardBg,
                    border: `1px solid ${tokens.colorBorder}`,
                }}
            >
               <div className="px-3 py-4 sm:px-5">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tokens.colorTextTertiary }}>
                            {seal.requestNumber}
                    </span>
                    <span style={{ color: tokens.colorBorder }}>·</span>
                    <StatusBadge
                            label={formatProjectSealStatus(seal.status, t)}
                            variant={projectSealStatusVariant(seal.status)}
                    />
                    {
                        seal.sealedDocument?.id ? (
                            <Tag color="green">{t('hr.labels.sealAttached')}</Tag>
                        ) : null
                    }
               </div>
            </div>
            <SummaryStrip items={[
                {label: t('hr.labels.urgency'), value: formatProjectSealUrgency(seal.urgency,t)},
                {label: t('hr.labels.dateNeeded'), value: formatDisplayDate(seal.dateNeeded)},
                {label: t('hr.labels.issued'), value: seal.issuedAt ? formatProjectDate(seal.issuedAt): '-'},
                {label: t('hr.labels.sealedDocument'), value: sealedDocumentLink}
            ]} />
            <SectionCard title={t('hr.section.projectSealDetails')} bodyClassName="px-3 py-4 sm:px-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <MetaItem label={t('hr.form.description')}>
                        {seal.description}
                    </MetaItem>
                    <MetaItem label={t('hr.labels.employee')}>
                        {formatProjectSealEmployeeName(seal.employee)}
                    </MetaItem>
                    <MetaItem label={t('hr.labels.urgency')}>
                        {formatProjectSealUrgency(seal.urgency,t)}
                    </MetaItem>
                    <MetaItem label={t('hr.labels.dateNeeded')}>
                        {formatProjectDate(seal.dateNeeded ?? null)}
                    </MetaItem>
                    <MetaItem label={t('hr.labels.issued')}>
                        {seal.issuedAt ? formatProjectDate(seal.issuedAt): '-'}
                    </MetaItem>
                    <MetaItem label={t('hr.labels.sealedDocument')}>
                        {sealedDocumentLink}
                    </MetaItem>
                </div>
            </SectionCard>

            {(seal.documents?.length ?? 0) > 0 ? (
                <SectionCard title={t('hr.section.documentToSeal')} bodyClassName="px-3 py-4 sm:px-5">
                    <AttachmentDownloadList documents={seal.documents} emptyLabel={t('hr.empty.noAttachments')} />
                </SectionCard>
            ) : null}
            {seal.sealedDocument ? (
                <SectionCard title={t('hr.section.sealedDocument')} bodyClassName="px-3 py-4 sm:px-5">
                    <AttachmentDownloadList documents={[seal.sealedDocument]} emptyLabel={t('hr.empty.noAttachments')} />
                </SectionCard>
            ) : null}
        </div>
    );
}