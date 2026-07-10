'use client';

import { useSearchParams } from 'next/navigation';
import ReviewModePageContent from '@/components/modules/projects/review/ReviewModePageContent';

export default function DesignPackageReviewModeClient({
  packageId,
}: {
  packageId: string;
}): React.ReactNode {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') ?? '';
  const taskDisciplineId = searchParams.get('disciplineId') ?? '';
  const reviewSessionId = searchParams.get('reviewSessionId');

  return (
    <ReviewModePageContent
      packageId={packageId}
      projectId={projectId}
      taskDisciplineId={taskDisciplineId}
      expectedReviewSessionId={reviewSessionId}
    />
  );
}
