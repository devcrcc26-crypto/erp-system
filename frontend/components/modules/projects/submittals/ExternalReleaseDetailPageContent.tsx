'use client';

import { useState } from 'react';
import { Alert, Button, Descriptions, Modal, Skeleton, Space, Steps, Tabs, Timeline } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  SubmittalExternalApproval,
  SubmittalExternalFeedback,
  SubmittalStatus,
} from '@/lib/api/project-management.types';
import { useSubmittal } from '@/lib/query/submittals';
import { useIssueSubmittal, useWithdrawSubmittal } from '@/lib/query/epc-submittals';
import { layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import { submittalStatusVariant } from '@/lib/utils/pm-status-display';
import { formatExternalReleasePurpose } from '@/lib/utils/external-release-purpose';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import ExternalReleaseDocumentsSection from '@/components/modules/projects/submittals/ExternalReleaseDocumentsSection';
import ExternalApprovalModal from '@/components/modules/projects/submittals/ExternalApprovalModal';
import ExternalFeedbackModal from '@/components/modules/projects/submittals/ExternalFeedbackModal';

/** Returns the 4-step workflow steps for external releases based on whether
 *  there is a site rep and/or consultant in any package item. */
function buildExternalSteps(
  hasSiteRep: boolean,
  hasConsultant: boolean,
): { title: string }[] {
  if (hasSiteRep && hasConsultant) {
    return [
      { title: 'Draft' },
      { title: 'Site Review' },
      { title: 'Consultant Review' },
      { title: 'Issued' },
    ];
  }
  if (hasSiteRep) {
    return [
      { title: 'Draft' },
      { title: 'Site Review' },
      { title: 'Site Approved' },
      { title: 'Issued' },
    ];
  }
  if (hasConsultant) {
    return [
      { title: 'Draft' },
      { title: 'Consultant Review' },
      { title: 'Consultant Reviewed' },
      { title: 'Issued' },
    ];
  }
  return [{ title: 'Draft' }, { title: 'Issued' }];
}

function getExternalStepCurrent(
  status: SubmittalStatus,
  hasSiteRep: boolean,
  hasConsultant: boolean,
): number {
  if (status === 'WITHDRAWN') {
    return -1;
  }
  if (hasSiteRep && hasConsultant) {
    if (status === 'DRAFT') return 0;
    if (status === 'UNDER_SITE_REVIEW' || status === 'SITE_APPROVED') return 1;
    if (status === 'PENDING_CONSULTANT_REVIEW' || status === 'CONSULTANT_REVIEWED') return 2;
    return 3;
  }
  if (hasSiteRep) {
    if (status === 'DRAFT') return 0;
    if (status === 'UNDER_SITE_REVIEW') return 1;
    if (status === 'SITE_APPROVED') return 2;
    return 3;
  }
  if (hasConsultant) {
    if (status === 'DRAFT') return 0;
    if (status === 'PENDING_CONSULTANT_REVIEW') return 1;
    if (status === 'CONSULTANT_REVIEWED') return 2;
    return 3;
  }
  return status === 'DRAFT' ? 0 : 1;
}

function formatExternalEventLabel(
  approval: SubmittalExternalApproval | SubmittalExternalFeedback,
): string {
  if ('approvalType' in approval) {
    return `${approval.approvalType === 'SITE' ? 'Site' : 'Consultant'} approval recorded`;
  }
  const from =
    approval.feedbackFrom === 'SITE'
      ? 'Site'
      : approval.feedbackFrom === 'CONSULTANT'
        ? 'Consultant'
        : 'Withdrawal';
  const kind = approval.feedbackKind === 'REJECTION' ? 'rejection' : 'comment';
  return `${from} ${kind} recorded`;
}

function releaseTargetLabel(hasSiteRep: boolean, hasConsultant: boolean): string {
  if (hasSiteRep && !hasConsultant) {
    return 'site';
  }
  if (hasConsultant && !hasSiteRep) {
    return 'consultant';
  }
  return 'external reviewers';
}

export default function ExternalReleaseDetailPageContent({
  projectId,
  submittalId,
}: {
  projectId: string;
  submittalId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();

  const [activeTab, setActiveTab] = useState('overview');
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalModalMode, setApprovalModalMode] = useState<'SITE' | 'CONSULTANT'>(
    'SITE',
  );
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackModalMode, setFeedbackModalMode] = useState<'SITE' | 'CONSULTANT'>(
    'SITE',
  );

  const submittalQuery = useSubmittal(projectId, submittalId);
  const issueSubmittal = useIssueSubmittal();
  const withdrawSubmittal = useWithdrawSubmittal();

  const submittal = submittalQuery.data;

  const isConstruction = submittal?.submittalPurpose === 'IN_CONSTRUCTION';

  const hasSiteRep = Boolean(
    submittal?.items.some(
      (item) =>
        Boolean(item.siteRepresentativeUserId) ||
        Boolean(item.siteRepEmail) ||
        Boolean(item.siteRepName),
    ),
  );
  const hasConsultant = Boolean(
    submittal?.items.some(
      (item) => Boolean(item.consultantName) || Boolean(item.consultantEmail),
    ),
  );

  const siteRepOnBehalfOf =
    submittal?.items.find((i) => i.siteRepName ?? i.siteRepEmail)?.siteRepName ??
    submittal?.items.find((i) => i.siteRepEmail)?.siteRepEmail ??
    'Site representative';

  const consultantOnBehalfOf =
    submittal?.items.find((i) => i.consultantName)?.consultantName ??
    submittal?.items.find((i) => i.consultantEmail)?.consultantEmail ??
    'Consultant';

  const siteRepItem = submittal?.items.find(
    (i) => i.siteRepName || i.siteRepEmail || i.siteRepresentativeUserId,
  );
  const consultantItem = submittal?.items.find(
    (i) => i.consultantName || i.consultantEmail,
  );

  const canIssue =
    Boolean(submittal) &&
    ((!hasSiteRep && !hasConsultant && submittal?.status === 'DRAFT') ||
      (hasSiteRep && !hasConsultant && submittal?.status === 'SITE_APPROVED') ||
      submittal?.status === 'CONSULTANT_REVIEWED');

  function handleIssue(): void {
    if (!submittal) return;
    Modal.confirm({
      title: 'Issue this release?',
      content: `The document snapshots will be frozen. Issue to ${releaseTargetLabel(hasSiteRep, hasConsultant)}?`,
      okText: 'Issue',
      cancelText: 'Cancel',
      onOk: () =>
        issueSubmittal
          .mutateAsync({ projectId, submittalId })
          .then((result) => {
            if (result.siteReviewStarted) {
              messageApi.success('Sent for site review');
            } else {
              messageApi.success('Release issued to external reviewers');
            }
            void submittalQuery.refetch();
          })
          .catch((error: unknown) => {
            notifyApiError(error, 'Failed to issue release', messageApi);
          }),
    });
  }

  function handleWithdraw(): void {
    if (!submittal) return;
    Modal.confirm({
      title: 'Withdraw this release?',
      content:
        'The release will be marked as withdrawn. A new revision can be created if needed.',
      okText: 'Withdraw',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () =>
        withdrawSubmittal
          .mutateAsync({ projectId, submittalId })
          .then(() => {
            messageApi.success('Release withdrawn');
            void submittalQuery.refetch();
          })
          .catch((error: unknown) => {
            notifyApiError(error, 'Failed to withdraw release', messageApi);
          }),
    });
  }

  function handleCreateRevision(): void {
    if (!submittal) return;
    messageApi.info(
      `Create a new external release with title: "${submittal.title} (Rev ${submittal.revisionNumber + 1})"`,
    );
  }

  function handleExternalActionSuccess(): void {
    void submittalQuery.refetch();
  }

  if (submittalQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (submittalQuery.isError || !submittal) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load external release"
        description={
          submittalQuery.error instanceof ApiRequestError
            ? submittalQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  const externalApprovals = submittal.externalApprovals ?? [];
  const externalFeedback = submittal.externalFeedback ?? [];

  type TimelineEvent =
    | (SubmittalExternalApproval & { _type: 'approval' })
    | (SubmittalExternalFeedback & { _type: 'feedback' });

  const externalTimeline: TimelineEvent[] = [
    ...externalApprovals.map((a) => ({ ...a, _type: 'approval' as const })),
    ...externalFeedback.map((f) => ({ ...f, _type: 'feedback' as const })),
  ].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const subtaskSummary =
    submittal.items.length > 0
      ? submittal.items
          .map(
            (item) =>
              `${item.fullSubtaskCode ?? item.packageCode ?? '-'} - ${
                item.packageName ?? 'Unknown subtask'
              }`,
          )
          .join('; ')
      : '-';

  const statusLabel =
    submittal.status === 'DRAFT'
      ? 'Draft'
      : submittal.status === 'SUBMITTED'
        ? 'Issued'
        : submittal.status;

  return (
    <div className={layout.pageStack}>
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(`/projects/${projectId}/submittals/external-release`)
            }
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to external releases
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {submittal.submittalNumber} - {submittal.title}
          </h1>
          <StatusBadge
            label={statusLabel}
            variant={submittalStatusVariant(submittal.status)}
          />
        </div>
        {submittal.status !== 'SUBMITTED' && submittal.status !== 'WITHDRAWN' && (
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            loading={withdrawSubmittal.isPending}
            onClick={handleWithdraw}
          >
            Withdraw release
          </Button>
        )}
      </div>

      {isConstruction && (
        <Alert
          type="info"
          showIcon
          message="This is a construction submittal, not an external release."
          description={
            <Link href={`/projects/${projectId}/submittals/${submittal.id}`}>
              Open the construction submittal detail page →
            </Link>
          }
        />
      )}

      {!isConstruction && (
        <>
          {submittal.status === 'WITHDRAWN' ? (
            <Alert
              type="warning"
              showIcon
              message="This release has been withdrawn."
            />
          ) : (
            <Steps
              size="small"
              current={getExternalStepCurrent(submittal.status, hasSiteRep, hasConsultant)}
              items={buildExternalSteps(hasSiteRep, hasConsultant)}
            />
          )}

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            destroyOnHidden
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <div className="flex flex-col gap-6">
                    <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                      <Descriptions
                        className={layout.drawerDescriptionsClass}
                        column={{ xs: 1, sm: 2 }}
                        size="small"
                        bordered
                      >
                        <Descriptions.Item label="ER number">
                          {submittal.submittalNumber}
                        </Descriptions.Item>
                        <Descriptions.Item label="Title">
                          {submittal.title}
                        </Descriptions.Item>
                        <Descriptions.Item label="Purpose">
                          {formatExternalReleasePurpose(submittal.submittalPurpose)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Subtask(s)">
                          {subtaskSummary}
                        </Descriptions.Item>
                        <Descriptions.Item label="Status">
                          <StatusBadge
                            label={statusLabel}
                            variant={submittalStatusVariant(submittal.status)}
                          />
                        </Descriptions.Item>
                        <Descriptions.Item label="Created by">
                          {submittal.submittedByName ?? submittal.submittedBy}
                        </Descriptions.Item>
                        <Descriptions.Item label="Issued date">
                          {submittal.issuedAt
                            ? formatProjectDate(submittal.issuedAt)
                            : 'Not yet issued'}
                        </Descriptions.Item>
                      </Descriptions>
                    </div>

                    {submittal.specReference?.trim() && (
                      <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                        <p className={`mb-2 ${layout.drawerHeading}`}>Description</p>
                        <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                          {submittal.specReference}
                        </p>
                      </div>
                    )}

                    {(siteRepItem || consultantItem) && (
                      <div>
                        <h3 className={`${layout.drawerHeading} mb-2`}>
                          External parties
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {siteRepItem && (
                            <div
                              className={layout.cardSurface + ' ' + layout.cardPadding}
                            >
                              <p className={`mb-2 ${layout.drawerHeading}`}>
                                Site representative
                              </p>
                              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                                {siteRepItem.siteRepName ?? '-'}
                              </p>
                              {siteRepItem.siteRepCompany && (
                                <p className={layout.drawerMutedText}>
                                  {siteRepItem.siteRepCompany}
                                </p>
                              )}
                              {siteRepItem.siteRepEmail && (
                                <p className={layout.drawerMutedText}>
                                  {siteRepItem.siteRepEmail}
                                </p>
                              )}
                              {siteRepItem.siteRepPhone && (
                                <p className={layout.drawerMutedText}>
                                  {siteRepItem.siteRepPhone}
                                </p>
                              )}
                            </div>
                          )}
                          {consultantItem && (
                            <div
                              className={layout.cardSurface + ' ' + layout.cardPadding}
                            >
                              <p className={`mb-2 ${layout.drawerHeading}`}>
                                Consultant
                              </p>
                              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                                {consultantItem.consultantName ?? '-'}
                              </p>
                              {consultantItem.consultantCompany && (
                                <p className={layout.drawerMutedText}>
                                  {consultantItem.consultantCompany}
                                </p>
                              )}
                              {consultantItem.consultantEmail && (
                                <p className={layout.drawerMutedText}>
                                  {consultantItem.consultantEmail}
                                </p>
                              )}
                              {consultantItem.consultantPhone && (
                                <p className={layout.drawerMutedText}>
                                  {consultantItem.consultantPhone}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'documents',
                label: 'Documents',
                children: (
                  <ExternalReleaseDocumentsSection
                    projectId={projectId}
                    submittal={submittal}
                    submittalId={submittalId}
                    onUpdated={() => void submittalQuery.refetch()}
                  />
                ),
              },
              {
                key: 'approvals',
                label: 'Approvals',
                children:
                  externalTimeline.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      title="No external activity recorded yet."
                      description="Use the action buttons below to record site or consultant responses."
                    />
                  ) : (
                    <Timeline
                      className="erp-drawer-timeline"
                      items={externalTimeline.map((event) => ({
                        color:
                          event._type === 'approval'
                            ? 'green'
                            : (event as SubmittalExternalFeedback).feedbackKind ===
                                'REJECTION'
                              ? 'red'
                              : 'blue',
                        content: (
                          <div>
                            <p className="font-medium text-[var(--color-text-primary)]">
                              {formatExternalEventLabel(event)}
                            </p>
                            <p className={`mt-0.5 ${layout.drawerMetaLabel}`}>
                              {dayjs(event.createdAt).format('D MMM YYYY, HH:mm')}
                            </p>
                            {event._type === 'approval' &&
                              (event as SubmittalExternalApproval).onBehalfOf && (
                                <p className={layout.drawerMutedText}>
                                  On behalf of:{' '}
                                  {(event as SubmittalExternalApproval).onBehalfOf}
                                </p>
                              )}
                            {event._type === 'approval' &&
                              (event as SubmittalExternalApproval).notes && (
                                <p
                                  className={`mt-1 whitespace-pre-wrap ${layout.drawerMutedText}`}
                                >
                                  {(event as SubmittalExternalApproval).notes}
                                </p>
                              )}
                            {event._type === 'feedback' && (
                              <p
                                className={`mt-1 whitespace-pre-wrap ${layout.drawerMutedText}`}
                              >
                                {(event as SubmittalExternalFeedback).comment}
                              </p>
                            )}
                            {event._type === 'feedback' &&
                              (event as SubmittalExternalFeedback).linkedCrId && (
                                <Link
                                  className="mt-1 block text-[12px]"
                                  href={`/projects/${projectId}/change-requests/${
                                    (event as SubmittalExternalFeedback).linkedCrId
                                  }`}
                                >
                                  View linked change request →
                                </Link>
                              )}
                            {(event._type === 'approval'
                              ? (event as SubmittalExternalApproval).evidenceFolderId
                              : (event as SubmittalExternalFeedback)
                                  .evidenceFolderId) && (
                              <div className="mt-2">
                                <DocumentAttachmentPanel
                                  folderId={
                                    event._type === 'approval'
                                      ? ((event as SubmittalExternalApproval)
                                          .evidenceFolderId ?? undefined)
                                      : ((event as SubmittalExternalFeedback)
                                          .evidenceFolderId ?? undefined)
                                  }
                                  readOnly
                                  title="Evidence"
                                  description=""
                                />
                              </div>
                            )}
                          </div>
                        ),
                      }))}
                    />
                  ),
              },
              {
                key: 'files',
                label: 'Files',
                children: (
                  <DocumentAttachmentPanel
                    folderId={submittal.attachmentFolderId ?? undefined}
                    readOnly={Boolean(submittal.issuedAt)}
                    title="Attached files"
                    description="Transmittal letters, cover sheets, and supporting documents."
                  />
                ),
              },
            ]}
          />

          {/* Sticky bottom workflow bar */}
          <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
            {submittal.status === 'DRAFT' && (hasSiteRep || hasConsultant) && (
              <div className="flex items-center justify-between gap-3">
                <span className={layout.drawerMutedText}>
                  Ready to send this release for review?
                </span>
                <Button
                  type="primary"
                  loading={issueSubmittal.isPending}
                  onClick={handleIssue}
                >
                  Send to {hasSiteRep ? 'Site' : 'Consultant'} Review
                </Button>
              </div>
            )}

            {submittal.status === 'DRAFT' && !hasSiteRep && !hasConsultant && (
              <div className="flex items-center justify-between gap-3">
                <span className={layout.drawerMutedText}>
                  No external review required for this release.
                </span>
                <Button
                  type="primary"
                  loading={issueSubmittal.isPending}
                  onClick={handleIssue}
                >
                  Issue for Construction
                </Button>
              </div>
            )}

            {submittal.status === 'UNDER_SITE_REVIEW' && (
              <div className="flex items-center justify-between gap-3">
                <span className={layout.drawerMutedText}>
                  Awaiting site representative review.
                </span>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      setApprovalModalMode('SITE');
                      setApprovalModalOpen(true);
                    }}
                  >
                    Record Site Approval
                  </Button>
                  <Button
                    icon={<CommentOutlined />}
                    onClick={() => {
                      setFeedbackModalMode('SITE');
                      setFeedbackModalOpen(true);
                    }}
                  >
                    Record Site Feedback
                  </Button>
                </Space>
              </div>
            )}

            {submittal.status === 'SITE_APPROVED' && !hasConsultant && (
              <div className="flex items-center justify-between gap-3">
                <span className={layout.drawerMutedText}>
                  Site review complete - ready to issue.
                </span>
                <Button
                  type="primary"
                  loading={issueSubmittal.isPending}
                  onClick={handleIssue}
                >
                  Issue for Construction
                </Button>
              </div>
            )}

            {submittal.status === 'PENDING_CONSULTANT_REVIEW' && (
              <div className="flex items-center justify-between gap-3">
                <span className={layout.drawerMutedText}>
                  Sent to consultant for review.
                </span>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      setApprovalModalMode('CONSULTANT');
                      setApprovalModalOpen(true);
                    }}
                  >
                    Record Consultant Approval
                  </Button>
                  <Button
                    icon={<CommentOutlined />}
                    onClick={() => {
                      setFeedbackModalMode('CONSULTANT');
                      setFeedbackModalOpen(true);
                    }}
                  >
                    Record Consultant Feedback
                  </Button>
                </Space>
              </div>
            )}

            {submittal.status === 'CONSULTANT_REVIEWED' && (
              <div className="flex items-center justify-between gap-3">
                <span className={layout.drawerMutedText}>
                  Consultant review complete - ready to issue.
                </span>
                <Button
                  type="primary"
                  loading={issueSubmittal.isPending}
                  onClick={handleIssue}
                >
                  Issue for Construction
                </Button>
              </div>
            )}

            {submittal.status === 'SITE_APPROVED' && hasConsultant && !canIssue && (
              <Alert
                type="info"
                showIcon
                title="Consultant approval required before issuing."
              />
            )}

            {submittal.status === 'WITHDRAWN' && (
              <Alert
                type="warning"
                showIcon
                message="This release was withdrawn."
                description="Create a new revision if you need to re-issue."
                action={
                  <Button size="small" onClick={handleCreateRevision}>
                    Create Revision
                  </Button>
                }
              />
            )}

            {submittal.status === 'SUBMITTED' && (
              <Alert
                type="success"
                showIcon
                title={
                  submittal.issuedAt
                    ? `Issued on ${formatProjectDate(submittal.issuedAt)}`
                    : 'Issued'
                }
                description="This release is read-only."
              />
            )}
          </div>
        </>
      )}

      {/* External approval modal */}
      {submittal && (
        <ExternalApprovalModal
          open={approvalModalOpen}
          mode={approvalModalMode}
          onBehalfOf={
            approvalModalMode === 'SITE' ? siteRepOnBehalfOf : consultantOnBehalfOf
          }
          projectId={projectId}
          submittalId={submittalId}
          attachmentFolderId={submittal.attachmentFolderId}
          onClose={() => setApprovalModalOpen(false)}
          onSuccess={handleExternalActionSuccess}
        />
      )}

      {/* External feedback modal */}
      {submittal && (
        <ExternalFeedbackModal
          open={feedbackModalOpen}
          mode={feedbackModalMode}
          projectId={projectId}
          submittalId={submittalId}
          onClose={() => setFeedbackModalOpen(false)}
          onSuccess={handleExternalActionSuccess}
        />
      )}
    </div>
  );
}
