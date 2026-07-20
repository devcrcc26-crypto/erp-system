'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Alert, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCanViewMyWork,
  useCanViewSubmittals,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { useMyWork } from '@/lib/query/epc-workspace';
import { useAllProjects } from '@/lib/query/projects';

interface ProjectRow {
  id: string;
  name: string;
  number: string;
}

/**
 * Global construction submittals hub — pick a project to open its submittals workspace.
 */
export default function GlobalSubmittalsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const capabilitiesReady = !usePermissionsLoading();
  const canViewSubmittals = useCanViewSubmittals();
  const canViewMyWork = useCanViewMyWork();
  const pm = usePmCapabilities();
  const canListProjects = pm.projects.canView;

  const projectsQuery = useAllProjects({}, canViewSubmittals && canListProjects);
  const myWorkQuery = useMyWork(
    undefined,
    canViewSubmittals && !canListProjects && canViewMyWork,
  );

  const rows = useMemo((): ProjectRow[] => {
    if (canListProjects) {
      return (projectsQuery.data?.data ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        number: project.projectCode,
      }));
    }

    const byId = new Map<string, ProjectRow>();
    for (const item of myWorkQuery.data ?? []) {
      if (!byId.has(item.projectId)) {
        byId.set(item.projectId, {
          id: item.projectId,
          name: item.projectName,
          number: item.projectNumber,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [canListProjects, projectsQuery.data?.data, myWorkQuery.data]);

  const columns: ColumnsType<ProjectRow> = [
    {
      title: t('pages.globalSubmittals.projectNumber'),
      dataIndex: 'number',
      key: 'number',
      width: 140,
    },
    {
      title: t('pages.globalSubmittals.projectName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <Link href={`/projects/${row.id}/submittals`}>{name}</Link>
      ),
    },
  ];

  if (!capabilitiesReady) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewSubmittals) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.globalSubmittals.noAccess')}
      />
    );
  }

  const listLoading =
    (canListProjects && projectsQuery.isLoading) ||
    (!canListProjects && canViewMyWork && myWorkQuery.isLoading);

  return (
    <FormLayout
      title={t('pages.globalSubmittals.title')}
      description={t('pages.globalSubmittals.description')}
    >
      <Table<ProjectRow>
        rowKey="id"
        loading={listLoading}
        columns={columns}
        dataSource={rows}
        pagination={rows.length > 20 ? { pageSize: 20 } : false}
        locale={{
          emptyText: (
            <Empty
              description={t('pages.globalSubmittals.empty')}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
      />
    </FormLayout>
  );
}
