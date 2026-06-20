'use client';

import { Spin } from 'antd';
import { Network } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { ApiRequestError } from '@/lib/api/errors';
import { useProject } from '@/lib/query/projects';
import { layout } from '@/lib/theme/layout';

/**
 * Project route wrapper — loading/error gates; layout lives in AppShell.
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
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    const status =
      projectQuery.error instanceof ApiRequestError
        ? projectQuery.error.status
        : 0;

    return (
      <PlaceholderPage
        icon={Network}
        title="Project not found"
        description={
          status === 404
            ? 'This project does not exist or the API is not available yet.'
            : 'Unable to load project details.'
        }
      />
    );
  }

  return <div className={layout.pageStack}>{children}</div>;
}
