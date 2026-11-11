'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Input, Modal, Space, Spin } from 'antd';
import { DownloadOutlined, FileOutlined } from '@ant-design/icons';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  SubmittalDetail,
  SubmittalItem,
  SubmittalItemReleasableEdv,
  SubmittalPurpose,
  SubmittalSiteReviewRow,
} from '@/lib/api/project-management.types';
import { apiGet } from '@/lib/api/client';
import { layout } from '@/lib/theme/layout';
import {
  fetchEdvDownloadUrl,
  submittalKeys,
  submittalsPath,
  useExcludeSubmittalItemEdv,
  useIncludeSubmittalItemEdv,
} from '@/lib/query/submittals';
import {
  useApproveSubmittalSiteReview,
  useCommentSubmittalSiteReview,
  useIssueSubmittal,
  useRequestSubmittalSiteReReview,
} from '@/lib/query/epc-submittals';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function releaseTargetLabel(purpose: SubmittalPurpose | null): string {
  if (purpose === 'DISCIPLINE_SITE') {
    return 'site';
  }
  if (purpose === 'DISCIPLINE_CONSULTANT') {
    return 'consultant';
  }
  return 'external reviewers';
}

function siteReviewStatusLabel(
  status: SubmittalSiteReviewRow['status'],
): string {
  if (status === 'APPROVED') {
    return 'Approved';
  }
  if (status === 'COMMENTED') {
    return 'Commented';
  }
  return 'Pending';
}

function siteReviewStatusVariant(
  status: SubmittalSiteReviewRow['status'],
): StatusBadgeVariant {
  if (status === 'APPROVED') {
    return 'success';
  }
  if (status === 'COMMENTED') {
    return 'warning';
  }
  return 'default';
}

function DraftItemEdvList({
  projectId,
  submittalId,
  item,
  edvs,
  loading,
}: {
  projectId: string;
  submittalId: string;
  item: SubmittalItem;
  edvs: SubmittalItemReleasableEdv[];
  loading: boolean;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const excludeEdv = useExcludeSubmittalItemEdv();
  const includeEdv = useIncludeSubmittalItemEdv();
  const excluded = useMemo(
    () => new Set(item.excludedEdvIds ?? []),
    [item.excludedEdvIds],
  );

  async function handleDownload(edvId: string): Promise<void> {
    try {
      const { url } = await fetchEdvDownloadUrl(projectId, edvId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyApiError(error, 'Failed to download file', messageApi);
    }
  }

  async function setIncluded(edvId: string, included: boolean): Promise<void> {
    try {
      if (included) {
        await includeEdv.mutateAsync({
          projectId,
          submittalId,
          itemId: item.id,
          edvId,
        });
      } else {
        await excludeEdv.mutateAsync({
          projectId,
          submittalId,
          itemId: item.id,
          edvId,
        });
      }
    } catch (error) {
      notifyApiError(error, 'Failed to update document selection', messageApi);
    }
  }

  if (loading) {
    return <Spin size="small" className="py-2" />;
  }

  if (edvs.length === 0) {
    return (
      <p className={`py-2 ${layout.drawerMutedText}`}>
        No locked documents in this subtask. Documents must be locked before they
        can be released.
      </p>
    );
  }

  return (
    <ul className="erp-drawer-file-list">
      {edvs.map((edv) => {
        const included = !excluded.has(edv.id);
        return (
          <li
            key={edv.id}
            className="flex flex-wrap items-start justify-between gap-2 py-2"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Checkbox
                checked={included}
                onChange={(event) => void setIncluded(edv.id, event.target.checked)}
              />
              <FileOutlined className="mt-0.5 text-[var(--color-text-secondary)]" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                  {edv.title}
                </p>
                <p className={layout.drawerMutedText}>
                  Rev {edv.revisionLabel}
                  {edv.documentNumber ? ` (${edv.documentNumber})` : ''}
                </p>
              </div>
            </div>
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => void handleDownload(edv.id)}
              >
                Download
              </Button>
              {included && (
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={() => void setIncluded(edv.id, false)}
                >
                  Remove
                </Button>
              )}
            </Space>
          </li>
        );
      })}
    </ul>
  );
}

function ReleasedSnapshotList({
  projectId,
  items,
}: {
  projectId: string;
  items: SubmittalItem[];
}): React.ReactNode {
  const messageApi = useAppMessage();

  async function handleDownload(edvId: string): Promise<void> {
    try {
      const { url } = await fetchEdvDownloadUrl(projectId, edvId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyApiError(error, 'Failed to download file', messageApi);
    }
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id}>
          <p className={`mb-2 font-medium ${layout.drawerHeading}`}>
            {item.fullSubtaskCode ?? item.packageCode ?? '-'} -{' '}
            {item.packageName ?? 'Unknown subtask'}
          </p>
          <ul className="erp-drawer-file-list">
            {(item.snapshotPayload ?? []).map((row) => (
              <li
                key={row.engineeringDocumentVersionId}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileOutlined className="mt-0.5 text-[var(--color-text-secondary)]" />
                  <div>
                    <p className="text-[12px] font-medium">{row.title}</p>
                    <p className={layout.drawerMutedText}>
                      Rev {row.revisionLabel}
                      {row.documentNumber ? ` (${row.documentNumber})` : ''}
                    </p>
                  </div>
                </div>
                <Button
                  type="link"
                  icon={<DownloadOutlined />}
                  onClick={() =>
                    void handleDownload(row.engineeringDocumentVersionId)
                  }
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SiteReviewPanel({
  projectId,
  submittal,
  submittalId,
  onUpdated,
}: {
  projectId: string;
  submittal: SubmittalDetail;
  submittalId: string;
  onUpdated: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const approveReview = useApproveSubmittalSiteReview();
  const commentReview = useCommentSubmittalSiteReview();
  const requestReReview = useRequestSubmittalSiteReReview();
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const reviews = submittal.siteReviews ?? [];
  const isCreator = currentUserId === submittal.submittedBy;
  const isLead = currentUserId === submittal.disciplineLeadUserId;

  return (
    <section className={`${layout.drawerSection} mb-4`}>
      <h3 className={`${layout.drawerHeading} mb-2`}>Site review</h3>
      <p className={`mb-3 ${layout.drawerMutedText}`}>
        All assigned site representatives must approve before this release can be
        issued.
      </p>
      <ul className="space-y-3">
        {reviews.map((review) => {
          const isMyReview = currentUserId === review.siteRepUserId;
          const canAct =
            isMyReview &&
            submittal.status === 'UNDER_SITE_REVIEW' &&
            review.status !== 'APPROVED';
          return (
            <li
              key={review.id}
              className="rounded border border-[var(--color-border)] p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {review.siteRepUserName ?? review.siteRepUserId}
                </span>
                <StatusBadge
                  label={siteReviewStatusLabel(review.status)}
                  variant={siteReviewStatusVariant(review.status)}
                />
              </div>
              {review.comment ? (
                <p className={`mb-2 whitespace-pre-wrap ${layout.drawerMutedText}`}>
                  {review.comment}
                </p>
              ) : null}
              {canAct ? (
                <div className="mt-2 space-y-2">
                  <Input.TextArea
                    rows={2}
                    placeholder="Optional comment"
                    value={commentDrafts[review.id] ?? ''}
                    onChange={(event) =>
                      setCommentDrafts((prev) => ({
                        ...prev,
                        [review.id]: event.target.value,
                      }))
                    }
                  />
                  <Space wrap>
                    <Button
                      type="primary"
                      size="small"
                      loading={approveReview.isPending}
                      onClick={() =>
                        void approveReview
                          .mutateAsync({
                            projectId,
                            submittalId,
                            reviewId: review.id,
                          })
                          .then(() => {
                            messageApi.success('Site review approved');
                            onUpdated();
                          })
                          .catch((error: unknown) => {
                            notifyApiError(
                              error,
                              'Failed to approve site review',
                              messageApi,
                            );
                          })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      loading={commentReview.isPending}
                      onClick={() => {
                        const comment = (commentDrafts[review.id] ?? '').trim();
                        if (!comment) {
                          messageApi.error('Enter a comment');
                          return;
                        }
                        void commentReview
                          .mutateAsync({
                            projectId,
                            submittalId,
                            reviewId: review.id,
                            comment,
                          })
                          .then(() => {
                            messageApi.success('Comment submitted');
                            setCommentDrafts((prev) => ({
                              ...prev,
                              [review.id]: '',
                            }));
                            onUpdated();
                          })
                          .catch((error: unknown) => {
                            notifyApiError(
                              error,
                              'Failed to submit comment',
                              messageApi,
                            );
                          });
                      }}
                    >
                      Comment only
                    </Button>
                  </Space>
                </div>
              ) : null}
              {(isCreator || isLead) &&
              review.status === 'COMMENTED' &&
              submittal.status === 'UNDER_SITE_REVIEW' ? (
                <Button
                  size="small"
                  className="mt-2"
                  loading={requestReReview.isPending}
                  onClick={() =>
                    void requestReReview
                      .mutateAsync({
                        projectId,
                        submittalId,
                        reviewId: review.id,
                      })
                      .then(() => {
                        messageApi.success('Re-review requested');
                        onUpdated();
                      })
                      .catch((error: unknown) => {
                        notifyApiError(
                          error,
                          'Failed to request re-review',
                          messageApi,
                        );
                      })
                  }
                >
                  Request re-review
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ExternalReleaseDocumentsSection({
  projectId,
  submittal,
  submittalId,
  onUpdated,
}: {
  projectId: string;
  submittal: SubmittalDetail;
  submittalId: string;
  onUpdated: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const issueSubmittal = useIssueSubmittal();
  const isDraft = submittal.status === 'DRAFT' && !submittal.issuedAt;
  const isUnderSiteReview = submittal.status === 'UNDER_SITE_REVIEW';
  const isSiteApproved = submittal.status === 'SITE_APPROVED';
  const isConsultantReviewed = submittal.status === 'CONSULTANT_REVIEWED';
  const hasSiteRep =
    submittal.items?.some(
      (item) => Boolean(item.siteRepName) || Boolean(item.siteRepresentativeUserId),
    ) ?? false;
  const hasConsultant =
    submittal.items?.some((item) => Boolean(item.consultantName)) ?? false;
  const canIssue =
    (!hasSiteRep && !hasConsultant && submittal.status === 'DRAFT') ||
    (hasSiteRep && !hasConsultant && submittal.status === 'SITE_APPROVED') ||
    submittal.status === 'CONSULTANT_REVIEWED';
  const canStartReview =
    isDraft && (hasSiteRep || hasConsultant);
  const showFrozenDocs =
    isUnderSiteReview ||
    isSiteApproved ||
    isConsultantReviewed ||
    Boolean(submittal.issuedAt) ||
    submittal.status === 'PENDING_CONSULTANT_REVIEW';

  const issueBlockedMessage = (() => {
    if (submittal.status === 'DRAFT' && hasSiteRep) {
      return 'Site representative approval required before issuing.';
    }
    if (submittal.status === 'SITE_APPROVED' && hasConsultant) {
      return 'Consultant approval required before issuing.';
    }
    return 'External approvals required before issuing.';
  })();

  const edvQueries = useQueries({
    queries: submittal.items.map((item) => ({
      queryKey: submittalKeys.itemEdvs(projectId, submittalId, item.id),
      queryFn: () =>
        apiGet<SubmittalItemReleasableEdv[]>(
          `${submittalsPath(projectId)}/${submittalId}/items/${item.id}/edvs`,
        ),
      enabled: isDraft && Boolean(submittalId),
      retry: false,
    })),
  });

  const selectedCount = useMemo(() => {
    if (!isDraft) {
      return 0;
    }
    let count = 0;
    submittal.items.forEach((item, index) => {
      const excluded = new Set(item.excludedEdvIds ?? []);
      const edvs = edvQueries[index]?.data ?? [];
      count += edvs.filter((edv) => !excluded.has(edv.id)).length;
    });
    return count;
  }, [isDraft, submittal.items, edvQueries]);

  function handleIssue(fromSiteApproved = false): void {
    Modal.confirm({
      title: fromSiteApproved
        ? 'Issue release to external party?'
        : 'Issue this package?',
      content: fromSiteApproved
        ? `Site review is complete. Issue to ${releaseTargetLabel(submittal.submittalPurpose)}?`
        : `The document snapshots will be frozen. If any subtask has a site representative, they must approve before final issue. Issue to ${releaseTargetLabel(submittal.submittalPurpose)}?`,
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
            onUpdated();
          })
          .catch((error: unknown) => {
            notifyApiError(error, 'Failed to issue release', messageApi);
          }),
    });
  }

  if (isDraft) {
    return (
      <section className={layout.drawerSection}>
        <h3 className={`${layout.drawerHeading} mb-3`}>Documents for release</h3>
        {submittal.items.map((item, index) => (
          <div
            key={item.id}
            className="mb-4 rounded border border-[var(--color-border)] p-3"
          >
            <p className={`mb-2 font-medium ${layout.drawerHeading}`}>
              {item.fullSubtaskCode ?? item.packageCode ?? '-'} -{' '}
              {item.packageName ?? 'Unknown subtask'}
            </p>
            <DraftItemEdvList
              projectId={projectId}
              submittalId={submittalId}
              item={item}
              edvs={edvQueries[index]?.data ?? []}
              loading={edvQueries[index]?.isLoading ?? false}
            />
          </div>
        ))}

        <h4 className={`${layout.drawerHeading} mb-2 mt-4`}>
          Additional attachments (optional)
        </h4>
        <p className={`mb-2 ${layout.drawerMutedText}`}>
          Add transmittal letters, cover sheets, or supporting documents
        </p>
        {submittal.attachmentFolderId ? (
          <DocumentAttachmentPanel
            folderId={submittal.attachmentFolderId}
            readOnly={false}
            title=""
            description=""
          />
        ) : (
          <p className={layout.drawerMutedText}>Loading attachment folder…</p>
        )}

        {submittal.items.length > 0 && canIssue && (
          <Button
            type="primary"
            className="mt-4"
            loading={issueSubmittal.isPending}
            disabled={selectedCount === 0}
            onClick={() => handleIssue(false)}
          >
            {`Issue ${selectedCount} document${selectedCount === 1 ? '' : 's'} to ${releaseTargetLabel(submittal.submittalPurpose)}`}
          </Button>
        )}
        {submittal.items.length > 0 && canStartReview && (
          <Button
            type="primary"
            className="mt-4"
            loading={issueSubmittal.isPending}
            disabled={selectedCount === 0}
            onClick={() => handleIssue(false)}
          >
            {`Submit ${selectedCount} document${selectedCount === 1 ? '' : 's'} for review`}
          </Button>
        )}
        {!canIssue &&
          submittal.status !== 'SUBMITTED' &&
          submittal.status !== 'WITHDRAWN' && (
            <Alert
              className="mt-4"
              type="info"
              showIcon
              title={issueBlockedMessage}
            />
          )}
      </section>
    );
  }

  return (
    <section className={layout.drawerSection}>
      {(isUnderSiteReview || isSiteApproved) && (
        <SiteReviewPanel
          projectId={projectId}
          submittal={submittal}
          submittalId={submittalId}
          onUpdated={onUpdated}
        />
      )}

      <h3 className={`${layout.drawerHeading} mb-3`}>
        {showFrozenDocs && !submittal.issuedAt
          ? 'Documents pending issue'
          : 'Released documents'}
      </h3>
      <ReleasedSnapshotList projectId={projectId} items={submittal.items} />

      <h4 className={`${layout.drawerHeading} mb-2 mt-4`}>Additional attachments</h4>
      {submittal.attachmentFolderId ? (
        <DocumentAttachmentPanel
          folderId={submittal.attachmentFolderId}
          readOnly={Boolean(submittal.issuedAt)}
          title=""
          description=""
        />
      ) : null}

      {canIssue && (
        <Button
          type="primary"
          className="mt-4"
          loading={issueSubmittal.isPending}
          onClick={() => handleIssue(true)}
        >
          {`Issue to ${releaseTargetLabel(submittal.submittalPurpose)}`}
        </Button>
      )}
      {!canIssue &&
        submittal.status !== 'SUBMITTED' &&
        submittal.status !== 'WITHDRAWN' && (
          <Alert
            className="mt-4"
            type="info"
            showIcon
            title={issueBlockedMessage}
          />
        )}
    </section>
  );
}
