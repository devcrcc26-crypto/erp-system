'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Skeleton,
  Tag,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import SealDocumentGallery from '@/components/modules/hr/shared/SealDocumentGallery';
import SealRequestDetailFields from '@/components/modules/hr/shared/SealRequestDetailFields';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { PROJECT_SEAL_FILE_ACCEPT } from '@/lib/constants/project-seal-upload';
import {
  useCancelProjectSeal,
  useIssueProjectSeal,
  useProjectSeal,
} from '@/lib/query/project-seal';
import ExportPdfButton from '@/components/modules/hr/import-export/ExportPdfButton';
import { useHrPdfContext } from '@/hooks/use-hr-pdf-context';
import { exportSealPdf } from '@/lib/utils/seal-export';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import {
  formatProjectSealEmployeeName,
  formatProjectSealStatus,
  formatProjectSealUrgency,
  projectSealStatusVariant,
} from '@/lib/utils/project-seal';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
const PROJECT_SEAL_LIST_PATH = '/hr/project-seal';

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Project seal detail — Users / employee profile chrome.
 */
export default function ProjectSealDetailPageContent({
  sealId,
}: {
  sealId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const pdfContext = useHrPdfContext();
  const currentUser = useCurrentUser();
  const detailQuery = useProjectSeal(sealId);
  const cancelMutation = useCancelProjectSeal(sealId);
  const issueMutation = useIssueProjectSeal(sealId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | undefined>();

  useSetHeaderExtra(null);

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
      messageApi.success(t('hr.messages.projectSealCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelProjectSeal'),
        messageApi,
        t,
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
      messageApi.success(t('hr.messages.projectSealIssued'));
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToIssueSeal'),
        messageApi,
        t,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-project-seal-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !seal) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.projectSealRequestNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push(PROJECT_SEAL_LIST_PATH)}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName =
    formatProjectSealEmployeeName(seal.employee) || '—';

  const overflowMenuItems: MenuProps['items'] = [];
  if (seal.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () => router.push(`/approvals/${seal.approvalRequestId}`),
    });
  }
  if (canCancel) {
    overflowMenuItems.push({
      key: 'cancel',
      label: t('hr.buttons.cancelRequest'),
      icon: <StopOutlined />,
      danger: true,
      onClick: () => setConfirmCancel(true),
    });
  }

  const showOverflowMenu = isNarrow && overflowMenuItems.length > 0;

  /** Renders this record with the shared HR document layout. */
  function handleExportPdf(): void {
    if (!seal) {
      return;
    }

      exportSealPdf({
        kind: 'project',
        seal,
        companyName: pdfContext.companyName,
        preparedBy: pdfContext.preparedBy,
      });
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-project-seal-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(PROJECT_SEAL_LIST_PATH)}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <ExportPdfButton
              compact={isNarrow}
              buildPdf={() => handleExportPdf()}
            />
            {showOverflowMenu ? (
              <Dropdown
                menu={{ items: overflowMenuItems }}
                trigger={['click']}
              >
                <Button
                  icon={<MoreOutlined />}
                  aria-label={t('common.actions')}
                />
              </Dropdown>
            ) : (
              <>
                {seal.approvalRequestId ? (
                  <Button
                    onClick={() =>
                      router.push(`/approvals/${seal.approvalRequestId}`)
                    }
                    aria-label={t('hr.buttons.viewInApprovals')}
                  >
                    {isCompact
                      ? t('nav.approvals')
                      : t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => setConfirmCancel(true)}
                    aria-label={t('hr.buttons.cancelRequest')}
                  >
                    {isCompact ? undefined : t('hr.buttons.cancelRequest')}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{seal.requestNumber}</span>
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
                <Tag color="blue">
                  {t('hr.labels.documentToSealAttached')}
                </Tag>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {seal.fileName}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
              {seal.submittedAt
                ? ` · ${formatProjectDate(seal.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.urgency')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectSealUrgency(seal.urgency, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.dateNeeded')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(seal.dateNeeded ?? null)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.issued')}</p>
            <p className="erp-employee-meta-value">
              {seal.issuedAt ? formatProjectDate(seal.issuedAt) : '—'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.issuedBy')}</p>
            <p className="erp-employee-meta-value truncate">
              {formatProjectSealEmployeeName(seal.issuer) || '—'}
            </p>
          </div>
        </div>
      </div>

      {seal.status === 'RETURNED' && isOwner ? (
        <ErpNotice
          tone="warning"
          className="mb-4"
          title={t('pages.hr.projectSeal.returnedNotice')}
          action={
            seal.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${seal.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
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
                  {formatProjectSealUrgency(seal.urgency, t)}
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
            </DetailSection>

            {(seal.documents?.length ?? 0) > 0 ? (
              <DetailSection title={t('hr.section.documentToSeal')}>
                <SealDocumentGallery
                  variant="tiles"
                  documents={seal.documents}
                  emptyLabel={t('hr.empty.noAttachments')}
                />
              </DetailSection>
            ) : null}

            {showIssueSeal ? (
              <DetailSection title={t('hr.section.issueSeal')}>
                <ErpNotice
                  tone="info"
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
                  onChange={(e) =>
                    setSelectedFile(e.target.files?.[0] ?? undefined)
                  }
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
              </DetailSection>
            ) : null}

            {seal.sealedDocument ? (
              <DetailSection title={t('hr.section.sealedProof')}>
                <SealDocumentGallery
                  variant="proof"
                  documents={[seal.sealedDocument]}
                  emptyLabel={t('hr.empty.noAttachments')}
                />
              </DetailSection>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4">
          {isDirectApproved || tiers.length === 0 ? (
            <div className="erp-pro-card overflow-hidden">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {isDirectApproved
                    ? t('hr.messages.directApprovalNoChain')
                    : t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={seal.approvalRequest?.currentTier ?? 1}
            />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelProjectSealTitle')}
        description={t('hr.dialog.cancelProjectSealDesc')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => {
          void handleCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
