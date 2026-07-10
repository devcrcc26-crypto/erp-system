'use client';

import { useState } from 'react';
import { Button, Checkbox, Input, Space, Tooltip } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import {
  useApproveReviewSession,
  useReturnPackageForRework,
} from '@/lib/query/design-packages';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import type { ReviewModeComment, ReviewTier } from '@/lib/api/epc.types';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';
import { isFinalReviewTier, isGovernanceReviewTier } from '@/lib/utils/review-governance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

export default function DisciplineLeadConsole({
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  currentTier,
  requiredTiers,
  instituteChiefUserId,
  instituteChiefName,
  comments,
  allDocumentsApproved,
  onAction,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string | null;
  currentTier: string | null;
  requiredTiers: ReadonlyArray<ReviewTier | string>;
  instituteChiefUserId: string | null;
  instituteChiefName: string | null;
  comments: readonly ReviewModeComment[];
  allDocumentsApproved: boolean;
  onAction: () => void;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const approveSession = useApproveReviewSession();
  const returnPackage = useReturnPackageForRework();
  const [approveOnBehalf, setApproveOnBehalf] = useState(false);
  const [onBehalfOfName, setOnBehalfOfName] = useState(instituteChiefName ?? '');

  if (permLoading) {
    return null;
  }

  if (!lens.canApproveReview || !reviewSessionId) {
    return null;
  }

  const isGovernanceTier = isGovernanceReviewTier(currentTier);

  if (!isGovernanceTier) {
    return null;
  }

  const approvalAllowed = canApproveReviewSession(comments.map((comment) => comment.status));
  const isFinalTier = isFinalReviewTier(currentTier, requiredTiers);
  const tierLabel = reviewTierBilingualLabel(currentTier ?? '');
  const isInstituteChiefProxyEligible =
    currentTier === 'INSTITUTE_CHIEF' && !instituteChiefUserId;
  const canSubmitApproval =
    approvalAllowed &&
    allDocumentsApproved &&
    (!approveOnBehalf || onBehalfOfName.trim().length > 0);
  const approveEscalateLabel = isFinalTier ? 'Approve' : 'Approve & escalate';
  const approveEscalateDisabled = !canSubmitApproval;
  const approveEscalateTooltip =
    !allDocumentsApproved
      ? 'Approve all documents before escalating.'
      : !approvalAllowed
        ? 'Resolve blocking comments before approving.'
        : undefined;

  return (
    <FormLayout
      title={`${tierLabel} console`}
      description={`Approve or return at the ${tierLabel} tier.`}
    >
      <ReviewApprovalBlockedAlert comments={comments} />
      {isInstituteChiefProxyEligible && (
        <div className="mb-3 space-y-2">
          <Checkbox
            checked={approveOnBehalf}
            onChange={(event) => setApproveOnBehalf(event.target.checked)}
          >
            Approve on behalf of Institute Chief
          </Checkbox>
          {approveOnBehalf && (
            <Input
              placeholder="Institute Chief's name"
              value={onBehalfOfName}
              onChange={(event) => setOnBehalfOfName(event.target.value)}
            />
          )}
        </div>
      )}
      <Space wrap>
        <Tooltip title={approveEscalateTooltip}>
          <span>
            <Button
              type="primary"
              disabled={approveEscalateDisabled}
              loading={approveSession.isPending}
              onClick={() => {
                void approveSession
                  .mutateAsync({
                    projectId,
                    taskDisciplineId,
                    packageId,
                    reviewSessionId,
                    body: approveOnBehalf
                      ? { approvedOnBehalfOfName: onBehalfOfName.trim() }
                      : undefined,
                  })
                  .then(() => {
                    messageApi.success('Session approved');
                    onAction();
                  })
                  .catch((error: unknown) => {
                    notifyApiError(error, 'Request failed', messageApi);
                  });
              }}
            >
              {approveEscalateLabel}
            </Button>
          </span>
        </Tooltip>
        <Button
          danger
          loading={returnPackage.isPending}
          onClick={() => {
            void returnPackage
              .mutateAsync({
                projectId,
                taskDisciplineId,
                packageId,
                body: {
                  reviewSessionId,
                  reason: `Returned by ${tierLabel}`,
                },
              })
              .then(() => {
                messageApi.success('Package returned');
                onAction();
              })
              .catch((error: unknown) => {
                notifyApiError(error, 'Request failed', messageApi);
              });
          }}
        >
          Return for rework
        </Button>
      </Space>
    </FormLayout>
  );
}
