// UI polish pass - styles only, no logic changes

'use client';

import { Network } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useProject } from '@/lib/query/projects';

/**
 * Project route wrapper - loading/error gates; layout lives in AppShell.
 */
export default function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}): React.ReactNode {
  const projectQuery = useProject(projectId);

  if (projectQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (projectQuery.isError || !projectQuery.data) {
    const status =
      projectQuery.error instanceof ApiRequestError
        ? projectQuery.error.status
        : 0;

    if (status === 404) {
      return (
        <PlaceholderPage
          icon={Network}
          title="Project not found"
          description="This project does not exist or the API is not available yet."
        />
      );
    }

    return (
      <PlaceholderPage
        icon={Network}
        title="Unable to load project"
        description="Project details could not be loaded. Try again later."
      />
    );
  }

  return <div className="flex flex-col gap-4">{children}</div>;
}
