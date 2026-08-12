'use client';

import { tokens } from "@/lib/theme/tokens";
import { MetaItem, SectionCard, SummaryStrip } from "../../hr/shared/hr-page-chrome";
import { Alert, Skeleton, Tag } from "antd";
import AttachmentDownloadList from "@/components/ui/FileUploadInput/AttachmentDownloadList";
import { useOfficialSeal } from "@/lib/query/official-seal";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import StatusBadge from "@/components/ui/StatusBadge/StatusBadge";
import {
    formatOfficialSealEmployeeName,
    formatOfficialSealStatus,
    formatOfficialSealUrgency,
    officialSealStatusVariant,
} from "@/lib/utils/official-seal";
import { ApiRequestError } from "@/lib/api/errors";
import { formatProjectDate } from "@/lib/utils/project-display";

export default function OfficialSealDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
    const { t } = useEpcTranslation();
    const detailQuery = useOfficialSeal(sourceId);
    const seal = detailQuery.data;

    if(detailQuery.isLoading && !seal) {
        return (
            <div className="rounded-lg p-6" style={{ 
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
                        : t('hr.messages.officialSealNotFound')
                }
            />
        );
    }

    const sealedDocumentLink = seal.sealedDocument?.id ? (
        seal.sealedDocument.name
    ) : '-';

  return (
    <div className="flex flex-col gap-4">
        <div
        className="rounded-lg overflow-hidden"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
        >
            <div className="px-5 py-4">
                <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
                >
                    {seal.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                    label={formatOfficialSealStatus(seal.status, t)}
                    variant={officialSealStatusVariant(seal.status)}
                />
                {
                    seal.sealedDocument?.id ? (
                        <Tag color="green">{t('hr.labels.sealedDocumentAttached')}</Tag>
                    ) : null
                }
            </div>
        </div>
        <SummaryStrip items={[
            {label: t('hr.labels.urgency'), value: formatOfficialSealUrgency(seal.urgency, t)},
            {label: t('hr.labels.dateNeeded'), value: formatProjectDate(seal.dateNeeded ?? null)},
            {label: t('hr.labels.issued'), value: seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-'},
            {label: t('hr.labels.sealedDocument'), value: sealedDocumentLink},
        ]} />

        <SectionCard title={t('hr.section.officialSealDetails')} bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">   
                <MetaItem label={t('hr.form.description')}>
                    {seal.description}
                </MetaItem>
                <MetaItem label={t('hr.labels.employee')}>
                    {formatOfficialSealEmployeeName(seal.employee)}
                </MetaItem>
                <MetaItem label={t('hr.labels.urgency')}>
                    {formatOfficialSealUrgency(seal.urgency, t)}
                </MetaItem>
                <MetaItem label={t('hr.labels.dateNeeded')}>
                    {formatProjectDate(seal.dateNeeded ?? null)}
                </MetaItem>
                <MetaItem label={t('hr.labels.issued')}>
                    {seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-'}
                </MetaItem>
                <MetaItem label={t('hr.labels.sealedDocument')}>
                    {sealedDocumentLink}
                </MetaItem>
        
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
        {seal.sealedDocument ? (
            <SectionCard title={t('hr.section.sealedProof')} bodyClassName="px-5 py-4">
                <AttachmentDownloadList
                    documents={[seal.sealedDocument]}
                    emptyLabel={t('hr.empty.noAttachments')}
                />
            </SectionCard>
        ) : null}
    </div>
  );
}
