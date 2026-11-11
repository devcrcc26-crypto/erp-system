// UI polish pass - styles only, no logic changes

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { DesignPackage } from '@/lib/api/epc.types';
import { designPackagesPath } from '@/lib/query/epc-query-utils';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { tokens } from '@/lib/theme/tokens';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';

interface DeliverableRow {
  id: string;
  name: string;
  disciplineIndex: number | null;
  taskDisciplineId: string;
  projectedStatus: string;
  projectionPending: boolean;
  itemCount: number;
}

export default function DeliverablesPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const disciplinesQuery = useProjectDisciplines(
    projectId,
    !permLoading && lens.canViewEngineering,
  );

  const deliverablesQuery = useQuery({
    queryKey: ['epc', 'deliverables', projectId],
    queryFn: async (): Promise<DeliverableRow[]> => {
      const disciplines = disciplinesQuery.data ?? [];
      const rows: DeliverableRow[] = [];

      for (const discipline of disciplines) {
        const packages = await apiGet<DesignPackage[]>(
          designPackagesPath(projectId, discipline.id),
        );
        for (const pkg of packages) {
          rows.push({
            id: pkg.id,
            name: pkg.name,
            disciplineIndex: discipline.disciplineIndex ?? null,
            taskDisciplineId: discipline.id,
            projectedStatus: pkg.projectedStatus,
            projectionPending: pkg.projectionPending,
            itemCount: pkg.items?.length ?? 0,
          });
        }
      }

      return rows;
    },
    enabled:
      !permLoading &&
      Boolean(projectId) &&
      lens.canViewEngineering &&
      Boolean(disciplinesQuery.data),
    retry: false,
  });

  const columns: ColumnsType<DeliverableRow> = useMemo(
    () => [
      {
        title: 'Deliverable (subtask)',
        dataIndex: 'name',
        key: 'name',
        render: (name: string, record) => (
          <Link
            href={`/projects/${projectId}/disciplines/${record.taskDisciplineId}/packages/${record.id}`}
            className="text-[13px] font-medium no-underline hover:underline"
            style={{ color: tokens.colorTeal600 }}
          >
            {name}
          </Link>
        ),
      },
      {
        title: 'Discipline',
        key: 'disciplineIndex',
        render: (_value, record) => formatDisciplineLabel(record.disciplineIndex),
      },
      {
        title: 'Status',
        key: 'status',
        render: (_value, record) => (
          <ProjectedStatusBadge
            status={record.projectedStatus}
            pending={record.projectionPending}
          />
        ),
      },
      {
        title: 'EDV count',
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 100,
        render: (value: number) => (
          <span className="tabular-nums">{value}</span>
        ),
      },
    ],
    [projectId],
  );

  if (permLoading || disciplinesQuery.isLoading || deliverablesQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering) {
    return (
      <Alert type="warning" showIcon title="You do not have access to deliverables." />
    );
  }

  return (
    <ProjectModuleGate projectId={projectId} module="deliverables">
    <FormLayout
      title="Deliverables"
      description="Derived from subtasks and EDV statuses until full Deliverable API ships."
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title="Read-only derived view"
        description="Deliverables are grouped from subtasks. Full CRUD will be available when the backend Deliverable API is released."
      />

      <DataTable<DeliverableRow>
        rowKey="id"
        columns={columns}
        dataSource={deliverablesQuery.data ?? []}
        loading={disciplinesQuery.isLoading || deliverablesQuery.isLoading}
        locale={{ emptyText: 'No deliverable subtasks found' }}
      />
    </FormLayout>
    </ProjectModuleGate>
  );
}
