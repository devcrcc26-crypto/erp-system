'use client';

import { Button, Space, message } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import {
  useApproveReviewSession,
  useReturnPackageForRework,
} from '@/lib/query/design-packages';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import type { ReviewModeComment } from '@/lib/api/epc.types';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';

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
  const approveSession = useApproveReviewSession();
  const returnPackage = useReturnPackageForRework();

  if (!lens.canApproveReview || !reviewSessionId) {
    return null;
  }

  const isLeadTier =
    currentTier === 'DISCIPLINE_LEAD' || currentTier === 'DEPT_CHIEF';

  if (!isLeadTier) {
    return null;
  }

  const approvalAllowed = canApproveReviewSession(comments.map((comment) => comment.status));

  return (
    <FormLayout
      title="Discipline lead console"
      description="Approve or return at discipline lead tier."
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
                message.success('Session approved');
                onAction();
              })
              .catch((error: unknown) => {
                notifyApiError(error);
              });
          }}
        >
          Approve & escalate
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
                  reason: 'Returned by discipline lead',
                },
              })
              .then(() => {
                message.success('Package returned');
                onAction();
              })
              .catch((error: unknown) => {
                notifyApiError(error);
              });
          }}
        >
          Return for rework
        </Button>
      </Space>
    </FormLayout>
  );
}
