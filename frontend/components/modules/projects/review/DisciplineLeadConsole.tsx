'use client';

import { Button, Space } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import {
  useApproveReviewSession,
  useReturnPackageForRework,
} from '@/lib/query/design-packages';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import type { ReviewModeComment } from '@/lib/api/epc.types';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

export default function DisciplineLeadConsole({
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  currentTier,
  comments,
  onAction,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string | null;
  currentTier: string | null;
  comments: readonly ReviewModeComment[];
  onAction: () => void;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const approveSession = useApproveReviewSession();
  const returnPackage = useReturnPackageForRework();

  if (permLoading) {
    return null;
  }

  if (!lens.canApproveReview || !reviewSessionId) {
    return null;
  }

  const isGovernanceTier =
    currentTier === 'DISCIPLINE_OWNER' ||
    currentTier === 'REVIEWER' ||
    currentTier === 'DISCIPLINE_LEAD' ||
    currentTier === 'DEPT_CHIEF';

  if (!isGovernanceTier) {
    return null;
  }

  const approvalAllowed = canApproveReviewSession(comments.map((comment) => comment.status));
  const isFinalTier = currentTier === 'DEPT_CHIEF';
  const tierLabel = reviewTierBilingualLabel(currentTier ?? '');

  return (
    <FormLayout
      title={`${tierLabel} console`}
      description={`Approve or return at the ${tierLabel} tier.`}
    >
      <ReviewApprovalBlockedAlert comments={comments} />
      <Space wrap>
        <Button
          type="primary"
          disabled={!approvalAllowed}
          loading={approveSession.isPending}
          onClick={() => {
            void approveSession
              .mutateAsync({
                projectId,
                taskDisciplineId,
                packageId,
                reviewSessionId,
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
          {isFinalTier ? 'Approve' : 'Approve & escalate'}
        </Button>
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
                  reason:
                    currentTier === 'DISCIPLINE_OWNER'
                      ? 'Returned by discipline owner'
                      : currentTier === 'REVIEWER'
                        ? 'Returned by reviewer'
                        : currentTier === 'DISCIPLINE_LEAD'
                          ? 'Returned by discipline lead'
                          : 'Returned by department chief',
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
