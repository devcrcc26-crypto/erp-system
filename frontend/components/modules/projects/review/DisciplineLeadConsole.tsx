'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Space, Tooltip } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import {
  useAddSessionAttachment,
  useApproveReviewSession,
  useDesignPackage,
} from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { usePackageRoleLens } from '@/lib/hooks/use-package-role-lens';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import type { ReviewModeComment, ReviewTier } from '@/lib/api/epc.types';
import {
  canApproveReviewSession,
  getCommentsBlockingApproval,
  resolveDefaultCommentAssignee,
  resolveDefaultCommentAssigneeLabel,
} from '@/lib/utils/comment-workflow';
import ReturnForReworkModal from '@/components/modules/projects/review/ReturnForReworkModal';
import ApproveReviewSessionModal from '@/components/modules/projects/review/ApproveReviewSessionModal';
import { isExternalInstituteChief } from '@/lib/utils/institute-chief';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  getNextReviewTier,
  getPreviousReviewTier,
  reviewTierBilingualLabel,
} from '@/lib/utils/review-tier-display';
import {
  canUserActAtCurrentReviewTier,
  isFinalReviewTier,
  isGovernanceReviewTier,
} from '@/lib/utils/review-governance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

export default function DisciplineLeadConsole({
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  sessionStatus,
  currentTier,
  requiredTiers,
  instituteChiefUserId,
  instituteChiefName,
  comments,
  allDocumentsApproved,
  availableDocuments,
  onAction,
  readOnly = false,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string | null;
  sessionStatus: string | null;
  currentTier: string | null;
  requiredTiers: ReadonlyArray<ReviewTier | string>;
  instituteChiefUserId: string | null;
  instituteChiefName: string | null;
  comments: readonly ReviewModeComment[];
  allDocumentsApproved: boolean;
  availableDocuments: readonly { value: string; label: string }[];
  onAction: () => void;
  readOnly?: boolean;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId) && Boolean(packageId),
  );
  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId);
  const packageLens = usePackageRoleLens(
    packageQuery.data,
    disciplineQuery.data,
    (currentTier as ReviewTier | null | undefined) ?? null,
  );
  const approveSession = useApproveReviewSession();
  const addSessionAttachment = useAddSessionAttachment(
    projectId,
    taskDisciplineId,
    packageId,
    reviewSessionId ?? '',
  );
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveButtonLocked, setApproveButtonLocked] = useState(false);
  const [isConfirmingApproval, setIsConfirmingApproval] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [recentEscalation, setRecentEscalation] = useState<{
    fromTier: string;
    at: string;
  } | null>(null);

  const requiredTierList = useMemo(
    () => requiredTiers as readonly ReviewTier[],
    [requiredTiers],
  );

  useEffect(() => {
    setRecentEscalation(null);
    setApproveButtonLocked(false);
  }, [reviewSessionId]);

  if (permLoading) {
    return null;
  }

  if (readOnly) {
    return null;
  }

  if (!lens.canApproveReview || !reviewSessionId) {
    return null;
  }

  const isGovernanceTier = isGovernanceReviewTier(currentTier);

  if (!isGovernanceTier) {
    return null;
  }

  const canActAtCurrentTier = canUserActAtCurrentReviewTier(
    packageLens,
    disciplineQuery.data,
    currentUserId,
    currentTier,
    instituteChiefUserId,
    instituteChiefName,
    lens.canApproveReview,
  );
  const showActionConsole =
    canActAtCurrentTier && sessionStatus === 'ACTIVE';
  const showVerifyOnlyConsole =
    canActAtCurrentTier && sessionStatus === 'RETURNED_FOR_REWORK';
  const showReadOnlyConsole =
    sessionStatus === 'ACTIVE' && !showActionConsole;

  if (!showActionConsole && !showReadOnlyConsole && !showVerifyOnlyConsole) {
    return null;
  }

  const approvalAllowed = canApproveReviewSession(comments.map((comment) => comment.status));
  const isFinalTier = isFinalReviewTier(currentTier, requiredTiers);
  const tierLabel = reviewTierBilingualLabel(currentTier ?? '');
  const nextTier = getNextReviewTier(currentTier, requiredTierList);
  const nextTierLabel = nextTier ? reviewTierBilingualLabel(nextTier) : null;
  const isInstituteChiefProxyEligible =
    currentTier === 'INSTITUTE_CHIEF' &&
    isExternalInstituteChief({
      instituteChiefUserId,
      instituteChiefName,
    });
  const canSubmitApproval = approvalAllowed && allDocumentsApproved;
  const approveEscalateLabel = isFinalTier ? 'Approve' : 'Approve & escalate';
  const approveEscalateDisabled = !canSubmitApproval || approveButtonLocked;
  const openCommentCount = getCommentsBlockingApproval(comments).length;
  const approveEscalateTooltip =
    !allDocumentsApproved
      ? 'Approve all documents before escalating.'
      : !approvalAllowed
        ? `All comments must be verified before escalating. ${openCommentCount} comment(s) still open.`
        : undefined;
  const previousTier =
    recentEscalation?.fromTier ??
    getPreviousReviewTier(currentTier, requiredTierList);
  const previousTierLabel = previousTier
    ? reviewTierBilingualLabel(previousTier)
    : null;
  const escalationDate = recentEscalation?.at ?? null;
  const defaultAssigneeId =
    resolveDefaultCommentAssignee(packageQuery.data, currentTier) ?? '';
  const defaultAssigneeLabel = resolveDefaultCommentAssigneeLabel(
    defaultAssigneeId || undefined,
    disciplineQuery.data,
  );

  function closeApproveModal(): void {
    setApproveModalOpen(false);
    setApproveButtonLocked(false);
  }

  function openApproveModal(): void {
    setApproveButtonLocked(true);
    setApproveModalOpen(true);
  }

  async function handleConfirmApproval(params: {
    approvedOnBehalfOfName?: string;
    attachmentDocumentVersionId?: string;
    note?: string;
  }): Promise<void> {
    if (!reviewSessionId || !canSubmitApproval || !currentTier) {
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
        projectId,
        taskDisciplineId,
        packageId,
        reviewSessionId,
        body: params.approvedOnBehalfOfName
          ? { approvedOnBehalfOfName: params.approvedOnBehalfOfName }
          : undefined,
      });

      setRecentEscalation({
        fromTier: currentTier,
        at: new Date().toISOString(),
      });
      messageApi.success('Session approved');
      closeApproveModal();
      onAction();
    } catch (error: unknown) {
      notifyApiError(error, 'Request failed', messageApi);
      setApproveButtonLocked(false);
    } finally {
      setIsConfirmingApproval(false);
    }
  }

  if (showVerifyOnlyConsole) {
    return (
      <FormLayout
        title={`${tierLabel} console`}
        description="Designer revisions are ready. Verify each resolved comment below."
      >
        <ReviewApprovalBlockedAlert comments={comments} />
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Revisions are waiting for your verification. Use Verify on each RESOLVED
          comment in the list below.
        </div>
      </FormLayout>
    );
  }

  if (showReadOnlyConsole) {
    return (
      <FormLayout
        title={`${tierLabel} console`}
        description="You approved at the previous tier. The session is now with the next reviewer."
      >
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {previousTierLabel ? (
            <p>
              Approved at {previousTierLabel}
              {escalationDate ? ` on ${formatProjectDate(escalationDate)}` : ''}. Now with{' '}
              {tierLabel}.
            </p>
          ) : (
            <p>Now with {tierLabel}.</p>
          )}
        </div>
      </FormLayout>
    );
  }

  return (
    <FormLayout
      title={`${tierLabel} console`}
      description={`Approve or return at the ${tierLabel} tier.`}
    >
      <ReviewApprovalBlockedAlert comments={comments} />
      <Space wrap>
        <Tooltip title={approveEscalateTooltip}>
          <span>
            <Button
              type="primary"
              disabled={approveEscalateDisabled}
              onClick={openApproveModal}
            >
              {approveEscalateLabel}
            </Button>
          </span>
        </Tooltip>
        <Button danger onClick={() => setReturnModalOpen(true)}>
          Return for rework
        </Button>
      </Space>

      <ReturnForReworkModal
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        reviewSessionId={reviewSessionId}
        availableDocuments={availableDocuments}
        defaultAssigneeId={defaultAssigneeId}
        defaultAssigneeLabel={defaultAssigneeLabel}
        onSuccess={() => {
          setReturnModalOpen(false);
          onAction();
        }}
      />

      <ApproveReviewSessionModal
        open={approveModalOpen}
        onClose={closeApproveModal}
        onConfirm={handleConfirmApproval}
        isFinalTier={isFinalTier}
        nextTierLabel={nextTierLabel ?? 'next tier'}
        isInstituteChiefProxy={isInstituteChiefProxyEligible}
        loading={isConfirmingApproval}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        instituteChiefName={instituteChiefName}
      />
    </FormLayout>
  );
}
