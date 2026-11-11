'use client';

import { Descriptions } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import type { DesignPackage, ReviewModeView } from '@/lib/api/epc.types';

export default function GovernanceReviewPanel({
  designPackage,
  reviewMode,
}: {
  designPackage: DesignPackage | null | undefined;
  reviewMode: ReviewModeView | null | undefined;
}): React.ReactNode {
  if (!designPackage) {
    return null;
  }

  return (
    <FormLayout
      title="Governance view"
      description="Aggregated subtask status for department and institute chiefs."
    >
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Subtask">{designPackage.name}</Descriptions.Item>
        <Descriptions.Item label="Projected status">
          <ProjectedStatusBadge
            status={designPackage.projectedStatus}
            pending={designPackage.projectionPending}
          />
        </Descriptions.Item>
        <Descriptions.Item label="Review tier">
          {reviewMode?.currentTier?.replace(/_/g, ' ') ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Session status">
          {reviewMode?.sessionStatus?.replace(/_/g, ' ') ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Subtask items">
          {reviewMode?.packageEdvIds.length ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label="Upstream snapshot">
          {reviewMode?.snapshotEdvIds.length ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label="Comments">
          {reviewMode?.comments.length ?? 0}
        </Descriptions.Item>
      </Descriptions>
    </FormLayout>
  );
}
