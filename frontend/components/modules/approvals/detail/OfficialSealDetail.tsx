import { tokens } from "@/lib/theme/tokens";
import { MetaItem, SectionCard, SummaryStrip } from "../../hr/shared/hr-page-chrome";
import { Alert, Skeleton, Tag, Typography } from "antd";
import { useOfficialSeal } from "@/lib/query/official-seal";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import StatusBadge from "@/components/ui/StatusBadge/StatusBadge";
import { formatOfficialSealEmployeeName, formatOfficialSealStatus, officialSealStatusVariant } from "@/lib/utils/official-seal";
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
                        : 'Official seal not found'
                }
            />
        );
    }

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
                    {seal?.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                    label={formatOfficialSealStatus(seal.status, t)}
                    variant={officialSealStatusVariant(seal.status)}
                />
                {
                    seal?.sealedDocument?.id ? (
                        <Tag color="green">Receipt attached</Tag>
                    ) : null
                }
            </div>
        </div>
        <SummaryStrip items={[
            {label: t('hr.labels.urgency'), value: seal.urgency},
            {label: t('hr.labels.dateNeeded'), value: formatProjectDate(seal.dateNeeded ?? null)},
            {label: 'Issued', value: seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-'},
            {label: 'Sealed Document', value: seal.sealedDocument?.id ? <a href={`/hr/official-seal/${seal.sealedDocument.id}`}>{seal.sealedDocument.name}</a> : '-'},
        ]} />

        <SectionCard title="Official Seal Details" bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">   
                <MetaItem label="Description">
                    {seal.description}
                </MetaItem>
                <MetaItem label="Employee">
                    {formatOfficialSealEmployeeName(seal.employee)}
                </MetaItem>
                <MetaItem label="Urgency">
                    {seal.urgency}
                </MetaItem>
                <MetaItem label="Date Needed">
                    {formatProjectDate(seal.dateNeeded ?? null)}
                </MetaItem>
                <MetaItem label="Issued">
                    {seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-'}
                </MetaItem>
                <MetaItem label="Sealed Document">
                    {seal.sealedDocument?.id ? <a href={`/hr/official-seal/${seal.sealedDocument.id}`}>{seal.sealedDocument.name}</a> : '-'}
                </MetaItem>
        
            </div>
        </SectionCard>
    </div>
  );
}