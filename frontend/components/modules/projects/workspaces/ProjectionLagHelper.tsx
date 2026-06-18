'use client';

import { Alert } from 'antd';

/**
 * Explains that package/discipline aggregate badges may lag until projection commits.
 */
export default function ProjectionLagHelper({
  pending,
}: {
  pending?: boolean;
}): React.ReactNode {
  if (!pending) {
    return (
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Aggregate status is derived from document versions"
        description="Package and discipline status badges may take a moment to update after workflow actions complete."
      />
    );
  }

  return (
    <Alert
      type="warning"
      showIcon
      className="mb-4"
      title="Status projection in progress"
      description="Workflow committed — aggregate badges refresh after the projection job runs. Document-level statuses are authoritative."
    />
  );
}
