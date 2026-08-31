'use client';

import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Skeleton, Space, Tag, Typography } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import SealDocumentGallery from '@/components/modules/hr/shared/SealDocumentGallery';
import SealRequestDetailFields from '@/components/modules/hr/shared/SealRequestDetailFields';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import { OFFICIAL_SEAL_FILE_ACCEPT } from '@/lib/constants/official-seal-upload';
import {
  useCancelOfficialSeal,
  useIssueOfficialSeal,
  useOfficialSeal,
} from '@/lib/query/official-seal';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  formatOfficialSealEmployeeName,
  formatOfficialSealStatus,
  formatOfficialSealUrgency,
  officialSealStatusVariant,
} from '@/lib/utils/official-seal';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Official seal detail — aligned with Purchase Request / Vehicle Refueling chrome.
 */
export default function OfficialSealDetailPageContent({
  sealId,
}: {
  sealId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useOfficialSeal(sealId);
  const cancelMutation = useCancelOfficialSeal(sealId);
  const issueMutation = useIssueOfficialSeal(sealId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | undefined>();

  const seal = detailQuery.data;
  const showIssueSeal = canViewHr && seal?.status === 'APPROVED';
  const isOwner =
    Boolean(seal) && seal?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner &&
    (seal?.status === 'DRAFT' || seal?.status === 'SUBMITTED');
  const isDirectApproved =
    seal?.status === 'APPROVED' && !seal.approvalRequestId
      ? true
      : Boolean(seal?.directApproved);

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
      notifyApiError(
        error,
        t('hr.messages.failedToCancelOfficialSeal'),
        messageApi,
      );
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
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !seal) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.officialSealRequestNotFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/official-seal')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/official-seal')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.back')}
        </Button>
        <Space wrap size={8} className="ml-auto">
          {canCancel ? (
            <Button
              danger
              onClick={() => setConfirmCancel(true)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.cancelRequest')}
            </Button>
          ) : null}
        </Space>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
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
                  <Tag color="blue">
                    {t('hr.labels.documentToSealAttached')}
                  </Tag>
                ) : null}
              </div>
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {t('pages.hr.officialSeal.detail')} — {seal.fileName}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatOfficialSealEmployeeName(seal.employee)}
                {seal.submittedAt
                  ? ` · ${formatProjectDate(seal.submittedAt)}`
                  : null}
              </p>
            </div>

            {seal.status === 'RETURNED' && isOwner ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5"
                style={{
                  background: tokens.colorAmber50,
                  borderTop: `1px solid ${tokens.colorAmber400}`,
                }}
              >
                <Typography.Text style={{ color: tokens.colorAmber400 }}>
                  {t('hr.messages.officialSealReturned')}
                </Typography.Text>
                {seal.approvalRequestId ? (
                  <Button
                    size="small"
                    onClick={() =>
                      router.push(`/approvals/${seal.approvalRequestId}`)
                    }
                    style={{ borderRadius: 0 }}
                  >
                    {t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
              </div>
            ) : null}
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
                value: seal.issuedAt
                  ? formatProjectDate(seal.issuedAt)
                  : '—',
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
                remarks={seal.remarks}
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

          {showIssueSeal ? (
            <SectionCard
              title={t('hr.section.issueSeal')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
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
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ borderRadius: 0 }}
                >
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
                  style={{ borderRadius: 0 }}
                >
                  {t('hr.buttons.issueSeal')}
                </Button>
              </div>
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

        <div className="min-w-0">
          {isDirectApproved || tiers.length === 0 ? (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-4"
            >
              <Typography.Text type="secondary">
                {isDirectApproved
                  ? t('hr.messages.directApprovalNoChain')
                  : t('hr.empty.noApprovalChain')}
              </Typography.Text>
            </SectionCard>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={seal.approvalRequest?.currentTier ?? 1}
            />
          )}
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
