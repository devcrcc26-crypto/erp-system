// UI polish pass — styles only, no logic changes

'use client';

import { Spin } from 'antd';
import { Network } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { ApiRequestError } from '@/lib/api/errors';
import { useProject } from '@/lib/query/projects';
import { tokens } from '@/lib/theme/tokens';

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
      <div
        className="flex justify-center rounded-[12px] bg-white p-8 sm:p-16"
        style={{ border: `0.5px solid ${tokens.colorBorder}` }}
      >
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

  return <div className="flex flex-col gap-4">{children}</div>;
}
