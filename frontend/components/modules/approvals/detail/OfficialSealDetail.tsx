'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import SealDocumentGallery from '@/components/modules/hr/shared/SealDocumentGallery';
import SealRequestDetailFields from '@/components/modules/hr/shared/SealRequestDetailFields';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useOfficialSeal } from '@/lib/query/official-seal';
import {
  formatOfficialSealEmployeeName,
  formatOfficialSealUrgency,
} from '@/lib/utils/official-seal';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Official seal body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function OfficialSealDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useOfficialSeal(sourceId);
  const seal = detailQuery.data;

  if (detailQuery.isLoading && !seal) {
    return (
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !seal) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.officialSealNotFound')
        }
      />
    );
  }

  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
      <SummaryStrip
        items={[
          {
            label: t('hr.labels.urgency'),
            value: formatOfficialSealUrgency(seal.urgency, t),
          },
          {
            label: t('hr.labels.dateNeeded'),
            value: formatProjectDate(seal.dateNeeded ?? null),
          },
          {
            label: t('hr.labels.issued'),
            value: seal.issuedAt ? formatProjectDate(seal.issuedAt) : '-',
          },
          {
            label: t('hr.labels.issuedBy'),
            value: formatOfficialSealEmployeeName(seal.issuer),
          },
        ]}
      />

      <SectionCard
        title={t('hr.section.requestDetails')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetaItem label={t('hr.form.fileName')}>
            {seal.fileName}
          </MetaItem>
          <MetaItem label={t('hr.form.description')}>
            <p className="m-0 whitespace-pre-wrap leading-relaxed">
              {seal.description}
            </p>
          </MetaItem>
          <MetaItem label={t('hr.labels.dateNeeded')}>
            {formatProjectDate(seal.dateNeeded ?? null)}
          </MetaItem>
          <MetaItem label={t('hr.labels.urgency')}>
            {formatOfficialSealUrgency(seal.urgency, t)}
          </MetaItem>
          <SealRequestDetailFields
            sealCategory={seal.sealCategory}
            copyCount={seal.copyCount}
          />
          {seal.completedAt ? (
            <MetaItem label={t('hr.labels.completedAt')}>
              {formatProjectDate(seal.completedAt)}
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>

      {(seal.documents?.length ?? 0) > 0 ? (
        <SectionCard
          title={t('hr.section.documentToSeal')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <SealDocumentGallery
            variant="tiles"
            documents={seal.documents}
            emptyLabel={t('hr.empty.noAttachments')}
          />
        </SectionCard>
      ) : null}

      {seal.sealedDocument ? (
        <SectionCard
          title={t('hr.section.sealedProof')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <SealDocumentGallery
            variant="proof"
            documents={[seal.sealedDocument]}
            emptyLabel={t('hr.empty.noAttachments')}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
