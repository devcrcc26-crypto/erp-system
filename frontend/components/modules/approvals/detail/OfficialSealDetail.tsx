'use client';

import { Alert, Skeleton, Tag } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useOfficialSeal } from '@/lib/query/official-seal';
import { tokens } from '@/lib/theme/tokens';
import {
  formatOfficialSealEmployeeName,
  formatOfficialSealStatus,
  formatOfficialSealUrgency,
  officialSealStatusVariant,
} from '@/lib/utils/official-seal';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Official seal body for the Approvals detail inbox (read-only).
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
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
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

  const isDirectApproved =
    seal.status === 'APPROVED' && !seal.approvalRequestId
      ? true
      : Boolean(seal.directApproved);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="overflow-hidden rounded-none"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <div className="px-3 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
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
            className="m-0 text-lg font-semibold leading-snug"
            style={{ color: tokens.colorTextPrimary }}
          >
            {t('pages.hr.officialSeal.detail')} — {seal.description}
          </h2>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {formatOfficialSealEmployeeName(seal.employee)}
            {seal.submittedAt
              ? ` · ${formatProjectDate(seal.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

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
            value: seal.issuedAt ? formatProjectDate(seal.issuedAt) : '—',
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
          <AttachmentDownloadList
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
          <AttachmentDownloadList
            documents={[seal.sealedDocument]}
            emptyLabel={t('hr.empty.noAttachments')}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
