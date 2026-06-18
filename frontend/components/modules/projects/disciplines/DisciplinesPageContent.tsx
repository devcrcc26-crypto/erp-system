'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectDisciplines, type ProjectDisciplineRow } from '@/lib/query/disciplines';
import { useDesignPackages } from '@/lib/query/design-packages';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

function DisciplinePackageCount({
  projectId,
  disciplineId,
}: {
  projectId: string;
  disciplineId: string;
}): React.ReactNode {
  const query = useDesignPackages(projectId, disciplineId);
  if (query.isLoading) {
    return <span className="text-slate-400">…</span>;
  }
  return <span>{query.data?.length ?? 0}</span>;
}

export default function DisciplinesPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const { t } = useEpcTranslation();
  const [search, setSearch] = useState('');
  const disciplinesQuery = useProjectDisciplines(projectId, lens.canViewEngineering);

  const apiUnavailable =
    disciplinesQuery.isError &&
    disciplinesQuery.error instanceof ApiRequestError &&
    (disciplinesQuery.error.status === 404 || disciplinesQuery.error.status === 0);

  const filtered = useMemo(() => {
    const rows = disciplinesQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) {
      return rows;
    }
    return rows.filter(
      (row) =>
        row.disciplineName.toLowerCase().includes(term) ||
        row.taskName.toLowerCase().includes(term),
    );
  }, [disciplinesQuery.data, search]);

  const columns: ColumnsType<ProjectDisciplineRow> = [
    {
      title: 'Discipline',
      dataIndex: 'disciplineName',
      key: 'disciplineName',
      render: (name: string, record) => (
        <Link href={`/projects/${projectId}/disciplines/${record.id}`}>
          {name}
        </Link>
      ),
    },
    {
      title: 'Schedule task',
      dataIndex: 'taskName',
      key: 'taskName',
      ellipsis: true,
    },
    {
      title: 'Projected status',
      key: 'projectedStatus',
      render: (_value, record) =>
        record.projectedStatus ? (
          <ProjectedStatusBadge status={record.projectedStatus} />
        ) : (
          '—'
        ),
    },
    {
      title: 'Designer',
      dataIndex: 'designerName',
      key: 'designerName',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Packages',
      key: 'packages',
      width: 90,
      render: (_value, record) => (
        <DisciplinePackageCount projectId={projectId} disciplineId={record.id} />
      ),
    },
  ];

  if (!lens.canViewEngineering) {
    return (
      <Alert type="warning" showIcon title="You do not have access to engineering workspaces." />
    );
  }

  return (
    <FormLayout
      title={t('pages.disciplines.title')}
      description={t('pages.disciplines.description')}
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="EPC disciplines API not connected"
          description="Disciplines are sourced from schedule tasks. Design package counts appear when the backend is available."
        />
      )}

      <Input.Search
        allowClear
        placeholder="Search disciplines or tasks…"
        className="mb-4 max-w-xs"
        onSearch={setSearch}
      />

      <DataTable<ProjectDisciplineRow>
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={disciplinesQuery.isLoading}
        locale={{ emptyText: t('empty.noDisciplines') }}
      />
    </FormLayout>
  );
}
