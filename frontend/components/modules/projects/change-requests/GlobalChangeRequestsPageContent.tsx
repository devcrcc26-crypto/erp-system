'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Select } from 'antd';
import { DiffOutlined } from '@ant-design/icons';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ChangeRequestList from '@/components/modules/projects/change-requests/ChangeRequestList';
import { layout } from '@/lib/theme/layout';
import {
  useCanViewChangeRequests,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProjects, PROJECT_LIST_PAGE_SIZE } from '@/lib/query/projects';
import { useProjectContextStore } from '@/stores/project-context.store';

/**
 * Cross-project change requests — pick a project, then use the project CR list.
 */
export default function GlobalChangeRequestsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const capabilitiesReady = !usePermissionsLoading();
  const canViewChangeRequests = useCanViewChangeRequests();
  const activeProject = useProjectContextStore((state) => state.activeProject);
  const [projectId, setProjectId] = useState<string | undefined>();

  const projectsQuery = useProjects(
    { page: 1, limit: PROJECT_LIST_PAGE_SIZE },
    capabilitiesReady && canViewChangeRequests,
  );

  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((project) => ({
        value: project.id,
        label: project.projectCode
          ? `${project.projectCode} — ${project.name}`
          : project.name,
      })),
    [projectsQuery.data?.data],
  );

  useEffect(() => {
    if (projectId) {
      return;
    }
    if (activeProject?.id) {
      setProjectId(activeProject.id);
      return;
    }
    const first = projectsQuery.data?.data[0];
    if (first) {
      setProjectId(first.id);
    }
  }, [activeProject?.id, projectId, projectsQuery.data?.data]);

  if (!capabilitiesReady || projectsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewChangeRequests) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalChangeRequests.noAccess')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Select
        showSearch
        placeholder={t('pages.globalChangeRequests.projectPlaceholder')}
        className={layout.filterControlLg}
        value={projectId}
        onChange={setProjectId}
        options={projectOptions}
        optionFilterProp="label"
        suffixIcon={<DiffOutlined />}
      />

      {projectId ? (
        <ChangeRequestList projectId={projectId} />
      ) : (
        <Alert
          type="info"
          showIcon
          title={t('pages.globalChangeRequests.noProjects')}
        />
      )}
    </div>
  );
}
