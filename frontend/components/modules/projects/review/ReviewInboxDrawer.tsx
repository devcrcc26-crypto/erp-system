'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Drawer, Space, Tooltip } from 'antd';
import CommentSeverityTag from '@/components/modules/projects/review/CommentSeverityTag';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import ApproveReviewSessionModal from '@/components/modules/projects/review/ApproveReviewSessionModal';
import ReturnForReworkModal from '@/components/modules/projects/review/ReturnForReworkModal';
import {
  useAddSessionAttachment,
  useApproveReviewSession,
  useDesignPackage,
} from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import { useEngineeringDocuments } from '@/lib/query/engineering-documents';
import { useVerifyReviewComment } from '@/lib/query/review-comments';
import { useAuthStore } from '@/stores/auth.store';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatDisciplineNumber } from '@/lib/utils/discipline-display';
import { reviewModeHref } from '@/lib/utils/schedule-subtasks';
import { resolveEdvDisplayLabel } from '@/lib/utils/edv-display';
import { getNextReviewTier, reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';
import { isFinalReviewTier } from '@/lib/utils/review-governance';
import { isExternalInstituteChief } from '@/lib/utils/institute-chief';
import {
  APPROVE_BLOCKING_STATUSES,
  canApproveReviewSession,
  resolveDefaultCommentAssignee,
  resolveDefaultCommentAssigneeLabel,
} from '@/lib/utils/comment-workflow';
import { wideDetailDrawerProps } from '@/lib/theme/layout';
import type {
  EngineeringDocument,
  ReviewInboxItem,
  ReviewModeComment,
  ReviewTier,
} from '@/lib/api/epc.types';

export default function ReviewInboxDrawer({
  open,
  onClose,
  item,
  onActionComplete,
}: {
  open: boolean;
  onClose: () => void;
  item: ReviewInboxItem | null;
  onActionComplete: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isCompleted = item?.inboxStatus === 'COMPLETED';

  const canLoad = open && Boolean(item);
  const packageQuery = useDesignPackage(
    item?.projectId ?? '',
    item?.taskDisciplineId ?? '',
    item?.designPackageId ?? '',
    canLoad,
  );
  const disciplineQuery = useProjectDiscipline(
    item?.projectId ?? '',
    item?.taskDisciplineId ?? '',
    canLoad,
  );
  const reviewModeQuery = useDesignPackageReviewMode(
    item?.designPackageId ?? '',
    canLoad,
    item?.reviewSessionId ?? null,
  );
  const documentsQuery = useEngineeringDocuments(
    item?.projectId ?? '',
    item?.taskDisciplineId ?? '',
    { page: 1, limit: 100 },
    canLoad,
  );

  const approveSession = useApproveReviewSession();
  const addSessionAttachment = useAddSessionAttachment(
    item?.projectId ?? '',
    item?.taskDisciplineId ?? '',
    item?.designPackageId ?? '',
    item?.reviewSessionId ?? '',
  );
  const verifyComment = useVerifyReviewComment();

  const [approvedDocIds, setApprovedDocIds] = useState<Set<string>>(() => new Set());
  const [verifiedOverrides, setVerifiedOverrides] = useState<Set<string>>(() => new Set());
  const [verifyingCommentId, setVerifyingCommentId] = useState<string | null>(null);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [isConfirmingApproval, setIsConfirmingApproval] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  useEffect(() => {
    setApprovedDocIds(new Set());
    setVerifiedOverrides(new Set());
  }, [item?.designPackageId]);

  const reviewMode = reviewModeQuery.data;
  const pkg = packageQuery.data;
  const isDesignerRole =
    pkg?.designerUserId === currentUserId ||
    pkg?.supportingDesignerUserId === currentUserId;

  const edvMap = useMemo(() => {
    const map = new Map<
      string,
      { doc: EngineeringDocument; revisionLabel: string; status: string; documentVersionId: string }
    >();
    for (const doc of documentsQuery.data?.data ?? []) {
      for (const version of doc.versions ?? []) {
        map.set(version.id, {
          doc,
          revisionLabel: version.revisionLabel,
          status: version.status,
          documentVersionId: version.documentVersionId,
        });
      }
    }
    return map;
  }, [documentsQuery.data?.data]);

  const packageEdvIds = useMemo(() => {
    const fromPackage = (pkg?.items ?? []).map((row) => row.engineeringDocumentVersionId);
    const fromReviewMode = reviewMode?.packageEdvIds ?? [];
    return [...new Set([...fromPackage, ...fromReviewMode])];
  }, [pkg?.items, reviewMode?.packageEdvIds]);

  const totalDocs = packageEdvIds.length;
  const allDocumentsApproved = approvedDocIds.size === totalDocs && totalDocs > 0;

  function approveDocument(edvId: string): void {
    setApprovedDocIds((previous) => {
      const next = new Set(previous);
      next.add(edvId);
      return next;
    });
  }

  const myComments = useMemo(
    () =>
      (reviewMode?.comments ?? []).filter(
        (comment) =>
          comment.createdBy === currentUserId ||
          comment.assignedToUserId === currentUserId,
      ),
    [reviewMode?.comments, currentUserId],
  );

  function isCommentVerified(comment: ReviewModeComment): boolean {
    return (
      comment.status === 'VERIFIED' ||
      comment.status === 'CLOSED' ||
      verifiedOverrides.has(comment.id)
    );
  }

  const allCommentsVerified = canApproveReviewSession(
    (reviewMode?.comments ?? []).map((c) => c.status),
  );
  const openCount = (reviewMode?.comments ?? []).filter((c) =>
    APPROVE_BLOCKING_STATUSES.has(c.status),
  ).length;

  async function handleVerify(comment: ReviewModeComment): Promise<void> {
    setVerifyingCommentId(comment.id);
    setVerifiedOverrides((previous) => new Set(previous).add(comment.id));
    try {
      await verifyComment.mutateAsync({ commentId: comment.id });
      messageApi.success('Comment verified');
      void reviewModeQuery.refetch();
    } catch (error) {
      setVerifiedOverrides((previous) => {
        const next = new Set(previous);
        next.delete(comment.id);
        return next;
      });
      notifyApiError(error, 'Request failed', messageApi);
    } finally {
      setVerifyingCommentId(null);
    }
  }

  const currentTier = reviewMode?.currentTier ?? item?.currentTier ?? null;
  const tierLabel = reviewTierBilingualLabel(currentTier ?? '');
  const requiredTiers = pkg?.requiredTiers ?? [];
  const isFinalTier = isFinalReviewTier(currentTier, requiredTiers);
  const nextTier = getNextReviewTier(currentTier, requiredTiers as readonly ReviewTier[]);
  const nextTierLabel = nextTier ? reviewTierBilingualLabel(nextTier) : 'next tier';
  const isInstituteChiefProxyEligible =
    currentTier === 'INSTITUTE_CHIEF' &&
    isExternalInstituteChief({
      instituteChiefUserId: pkg?.instituteChiefUserId ?? null,
      instituteChiefName: pkg?.instituteChiefName ?? null,
    });

  const edvCommentOptions = useMemo(
    () =>
      packageEdvIds.map((edvId) => ({
        value: edvId,
        label: resolveEdvDisplayLabel(edvId, documentsQuery.data?.data ?? []),
      })),
    [packageEdvIds, documentsQuery.data?.data],
  );

  const defaultAssigneeId = resolveDefaultCommentAssignee(pkg, currentTier) ?? '';
  const defaultAssigneeLabel = resolveDefaultCommentAssigneeLabel(
    defaultAssigneeId || undefined,
    disciplineQuery.data,
  );

  const canSubmitApproval = allDocumentsApproved && allCommentsVerified;

  async function handleConfirmApproval(params: {
    approvedOnBehalfOfName?: string;
    attachmentDocumentVersionId?: string;
    note?: string;
  }): Promise<void> {
    if (!item || !item.reviewSessionId || !canSubmitApproval || !currentTier) {
      return;
    }
    setIsConfirmingApproval(true);
    try {
      if (params.attachmentDocumentVersionId) {
        await addSessionAttachment.mutateAsync({
          documentId: params.attachmentDocumentVersionId,
          note: params.note,
        });
      }
      await approveSession.mutateAsync({
        projectId: item.projectId,
        taskDisciplineId: item.taskDisciplineId,
        packageId: item.designPackageId,
        reviewSessionId: item.reviewSessionId,
        body: params.approvedOnBehalfOfName
          ? { approvedOnBehalfOfName: params.approvedOnBehalfOfName }
          : undefined,
      });
      messageApi.success('Session approved');
      setApproveModalOpen(false);
      onActionComplete();
    } catch (error: unknown) {
      notifyApiError(error, 'Request failed', messageApi);
    } finally {
      setIsConfirmingApproval(false);
    }
  }

  if (!item) {
    return (
      <Drawer {...wideDetailDrawerProps} open={open} onClose={onClose} title="Review subtask" />
    );
  }

  const title = item.subtaskId ?? item.packageCode ?? item.designPackageName;
  const subtitle = `${item.overseasTaskNumber ?? item.taskIdCode ?? '-'}-${formatDisciplineNumber(
    item.disciplineIndex,
  )} · ${item.disciplineName} · ${tierLabel}`;

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={
        <div>
          <p className="text-base font-semibold">{title}</p>
          <p className="text-xs font-normal text-slate-500">{subtitle}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-20">
        {isCompleted ? (
          <Alert
            type="warning"
            showIcon
            message={`You ${item.completedAction === 'RETURNED' ? 'returned' : 'approved'} this subtask${
              item.actionTakenAt ? ` on ${formatProjectDate(item.actionTakenAt)}` : ''
            }.`}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message={`Opened for review on ${formatProjectDate(item.openedAt)} at ${tierLabel} tier.`}
          />
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Documents
            {!isCompleted ? ` (${approvedDocIds.size} of ${totalDocs} approved)` : ''}
          </h3>
          {documentsQuery.isLoading ? (
            <p className="text-xs text-slate-500">Loading documents…</p>
          ) : packageEdvIds.length === 0 ? (
            <p className="text-xs text-slate-500">No documents in this subtask.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {packageEdvIds.map((edvId) => {
                const info = edvMap.get(edvId);
                const isApproved = approvedDocIds.has(edvId);
                return (
                  <li
                    key={edvId}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-slate-900">
                        {info
                          ? info.doc.title?.trim() ||
                            info.doc.documentNumber?.trim() ||
                            'Engineering document'
                          : 'Engineering document'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {info?.revisionLabel && <span>Rev {info.revisionLabel}</span>}
                        {info?.status && <EdvStatusBadge status={info.status} />}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!isCompleted &&
                        (isApproved ? (
                          <Button type="primary" size="small" disabled>
                            Approved ✓
                          </Button>
                        ) : (
                          <Button
                            type="default"
                            size="small"
                            onClick={() => approveDocument(edvId)}
                          >
                            Approve
                          </Button>
                        ))}
                      <EdvFileActions
                        compact
                        documentVersionId={info?.documentVersionId}
                        fileName={info?.doc.title}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">My comments</h3>
          {reviewModeQuery.isLoading ? (
            <p className="text-xs text-slate-500">Loading comments…</p>
          ) : myComments.length === 0 ? (
            <p className="text-xs text-slate-500">No comments of yours on this session.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {myComments.map((comment) => {
                const verified = isCommentVerified(comment);
                const showVerify =
                  !isCompleted &&
                  comment.status === 'RESOLVED' &&
                  comment.createdBy === currentUserId &&
                  !verifiedOverrides.has(comment.id);
                return (
                  <div
                    key={comment.id}
                    className="rounded-md border border-slate-200 p-3 text-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <CommentSeverityTag severity={comment.severity} />
                      <StatusBadge
                        label={(verified ? 'VERIFIED' : comment.status).replace(/_/g, ' ')}
                        variant="info"
                      />
                    </div>
                    <p className="mb-2 text-slate-800">{comment.body}</p>
                    {(comment.attachment ||
                      (comment.files ?? []).some((f) => !f.isResponseFile)) && (
                      <div className="mb-2 space-y-1 border-t border-slate-100 pt-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Comment attachment
                        </p>
                        {comment.attachment && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                            <span className="min-w-0 truncate">{comment.attachment.name}</span>
                            <EdvFileActions
                              compact
                              documentVersionId={comment.attachment.documentVersionId}
                              fileName={comment.attachment.name}
                            />
                          </div>
                        )}
                        {(comment.files ?? [])
                          .filter((f) => !f.isResponseFile)
                          .map((file) => (
                            <div
                              key={file.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
                            >
                              <span className="min-w-0 truncate">{file.fileName}</span>
                              <EdvFileActions
                                compact
                                documentVersionId={file.documentVersionId}
                                fileName={file.fileName}
                              />
                            </div>
                          ))}
                      </div>
                    )}
                    {(() => {
                      const responseFiles = (comment.files ?? []).filter(
                        (f) => f.isResponseFile,
                      );
                      const primaryRevised = comment.responseAttachment
                        ? {
                            documentVersionId:
                              comment.responseAttachment.documentVersionId,
                            name: comment.responseAttachment.name,
                          }
                        : comment.responseRevision
                          ? {
                              documentVersionId:
                                comment.responseRevision.documentVersionId,
                              name: `${comment.responseRevision.documentTitle} · Rev ${comment.responseRevision.revisionLabel}`,
                            }
                          : null;
                      if (!primaryRevised && responseFiles.length === 0) {
                        return null;
                      }
                      return (
                        <div className="mb-2 space-y-1 border-t border-slate-100 pt-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                            Designer response
                          </p>
                          {primaryRevised && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                              <span className="min-w-0 truncate">
                                Revised file: {primaryRevised.name}
                              </span>
                              <EdvFileActions
                                compact
                                documentVersionId={primaryRevised.documentVersionId}
                                fileName={primaryRevised.name}
                              />
                            </div>
                          )}
                          {responseFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
                            >
                              <span className="min-w-0 truncate">{file.fileName}</span>
                              <EdvFileActions
                                compact
                                documentVersionId={file.documentVersionId}
                                fileName={file.fileName}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {showVerify && (
                      <Button
                        size="small"
                        type="link"
                        className="!px-0"
                        loading={verifyingCommentId === comment.id}
                        onClick={() => void handleVerify(comment)}
                      >
                        Verify
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white p-4">
        {!isCompleted && (
          <>
            <Button onClick={() => setReturnModalOpen(true)}>Return for rework</Button>
            <Tooltip
              title={
                !allDocumentsApproved
                  ? 'Approve all documents before escalating.'
                  : !allCommentsVerified
                    ? `All comments must be verified before escalating. ${openCount} comment(s) still open.`
                    : undefined
              }
            >
              <span>
                <Button
                  type="primary"
                  disabled={!canSubmitApproval}
                  onClick={() => setApproveModalOpen(true)}
                >
                  {isFinalTier ? 'Approve' : 'Approve & escalate'}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
        {!isDesignerRole && (
          <Link
            href={reviewModeHref(
              item.projectId,
              item.taskDisciplineId,
              item.designPackageId,
              item.reviewSessionId,
              isCompleted
                ? {
                    readOnly: true,
                    actionTaken: item.completedAction,
                    actionTakenAt: item.actionTakenAt,
                  }
                : undefined,
            )}
          >
            <Button>Open full review mode</Button>
          </Link>
        )}
      </div>

      {item.reviewSessionId && (
        <>
          <ReturnForReworkModal
            open={returnModalOpen}
            onClose={() => setReturnModalOpen(false)}
            projectId={item.projectId}
            taskDisciplineId={item.taskDisciplineId}
            packageId={item.designPackageId}
            reviewSessionId={item.reviewSessionId}
            availableDocuments={edvCommentOptions}
            defaultAssigneeId={defaultAssigneeId}
            defaultAssigneeLabel={defaultAssigneeLabel}
            onSuccess={() => {
              setReturnModalOpen(false);
              onActionComplete();
            }}
          />

          <ApproveReviewSessionModal
            open={approveModalOpen}
            onClose={() => setApproveModalOpen(false)}
            onConfirm={handleConfirmApproval}
            isFinalTier={isFinalTier}
            nextTierLabel={nextTierLabel}
            isInstituteChiefProxy={isInstituteChiefProxyEligible}
            loading={isConfirmingApproval}
            projectId={item.projectId}
            taskDisciplineId={item.taskDisciplineId}
            instituteChiefName={pkg?.instituteChiefName}
          />
        </>
      )}
    </Drawer>
  );
}
