'use client';

import { Result } from 'antd';
import type { ReactNode } from 'react';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { useProjectModuleAccess } from '@/lib/permissions/module-access';
import type { PmModuleKey } from '@/lib/permissions/pm-modules.const';

interface ProjectModuleGateProps {
  projectId: string;
  module: PmModuleKey;
  children: ReactNode;
}

/**
 * Gates PM module pages by project readability (subtask / discipline /
 * leadership scope) - not ProjectTeam membership.
 */
export default function ProjectModuleGate({
  projectId,
  module,
  children,
}: ProjectModuleGateProps): ReactNode {
  const { canAccess, isLoading } = useProjectModuleAccess(projectId, module);

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccess) {
    return (
      <Result
        status="403"
        title="Access denied"
        subTitle={`You do not have access to the ${module.replace(/_/g, ' ')} module on this project.`}
      />
    );
  }

  return children;
}
