'use client';

import { Button, Space, message } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  useApproveReviewSession,
  useReturnPackageForRework,
} from '@/lib/query/design-packages';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';

export default function DisciplineLeadConsole({
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  currentTier,
  onAction,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string | null;
  currentTier: string | null;
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

  return (
    <FormLayout
      title="Discipline lead console"
      description="Approve or return at discipline lead tier."
    >
      <Space wrap>
        <Button
          type="primary"
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
              });
          }}
        >
          Return for rework
        </Button>
      </Space>
    </FormLayout>
  );
}
