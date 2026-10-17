'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Skeleton, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApartmentOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserDeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Building2, GitBranch, UserRoundX, Users } from 'lucide-react';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { OrgGapEmployee, OrgGapUnit } from '@/lib/api/org-gaps';
import { useOrgGapReport } from '@/lib/query/org-gaps';

const P = 'pages.hr.orgGaps';

type GapSection =
  | 'withoutSupervisor'
  | 'vacantSupervisor'
  | 'withoutDepartment'
  | 'withoutDiscipline'
  | 'departmentsWithoutLeader'
  | 'disciplinesWithoutLeader'
  | 'supervisorsWithoutAccount';

/**
 * HR org-structure gap report — floating KPI tiles + one table card (v2).
 */
export default function OrgGapsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useOrgGapReport(canViewHr);
  const [section, setSection] = useState<GapSection>('withoutSupervisor');
  const [search, setSearch] = useState('');

  const data = query.data;
  const totals = data?.totals;

  const employeeColumns: ColumnsType<OrgGapEmployee> = useMemo(
    () => [
      {
        title: t(`${P}.colEmployeeId`),
        dataIndex: 'employeeId',
        key: 'employeeId',
        width: 130,
        render: (value: string | null) =>
          value ? (
            <span className="erp-users-id-chip">{value}</span>
          ) : (
            <span className="erp-users-cell-sub">-</span>
          ),
      },
      {
        title: t(`${P}.colName`),
        dataIndex: 'name',
        key: 'name',
        render: (name: string) => (
          <span className="erp-users-name">{name}</span>
        ),
      },
      {
        title: t(`${P}.colDepartment`),
        dataIndex: 'departmentName',
        key: 'departmentName',
        render: (value: string | null) => (
          <span className="erp-users-cell-sub">{value ?? '-'}</span>
        ),
      },
      {
        title: t(`${P}.colDiscipline`),
        dataIndex: 'disciplineName',
        key: 'disciplineName',
        render: (value: string | null) => (
          <span className="erp-users-cell-sub">{value ?? '-'}</span>
        ),
      },
    ],
    [t],
  );

  const unitColumns: ColumnsType<OrgGapUnit> = useMemo(
    () => [
      {
        title: t(`${P}.colUnit`),
        dataIndex: 'name',
        key: 'name',
        render: (name: string) => (
          <span className="erp-users-name">{name}</span>
        ),
      },
      {
        title: t(`${P}.colMembers`),
        dataIndex: 'members',
        key: 'members',
        width: 110,
        render: (n: number) => n.toLocaleString(),
      },
      {
        title: t(`${P}.colReason`),
        dataIndex: 'reason',
        key: 'reason',
        width: 140,
        render: (reason: OrgGapUnit['reason']) => (
          <span className="erp-users-role-tag">
            {reason === 'VACANT'
              ? t(`${P}.reasonVacant`)
              : t(`${P}.reasonNone`)}
          </span>
        ),
      },
    ],
    [t],
  );

  const needle = search.trim().toLowerCase();

  const employeeRows = useMemo(() => {
    if (!data) return [];
    const source: OrgGapEmployee[] =
      section === 'withoutSupervisor'
        ? data.withoutSupervisor
        : section === 'vacantSupervisor'
          ? data.withVacantSupervisor
          : section === 'withoutDepartment'
            ? data.withoutDepartment
            : section === 'withoutDiscipline'
              ? data.withoutDiscipline
              : [];
    if (!needle) return source;
    return source.filter((row) =>
      [row.name, row.employeeId, row.departmentName, row.disciplineName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [data, needle, section]);

  const unitRows = useMemo(() => {
    if (!data) return [];
    const source: OrgGapUnit[] =
      section === 'departmentsWithoutLeader'
        ? data.departmentsWithoutLeader
        : section === 'disciplinesWithoutLeader'
          ? data.disciplinesWithoutLeader
          : [];
    if (!needle) return source;
    return source.filter((row) => row.name.toLowerCase().includes(needle));
  }, [data, needle, section]);

  const supervisorNames = useMemo(() => {
    const names = data?.supervisorsWithoutAccount ?? [];
    if (!needle) return names;
    return names.filter((name) => name.toLowerCase().includes(needle));
  }, [data, needle]);

  const sectionMeta: Record<
    GapSection,
    { title: string; count: number; empty: string }
  > = {
    withoutSupervisor: {
      title: t(`${P}.employeesNoSupervisor`),
      count: totals?.withoutSupervisor ?? 0,
      empty: t(`${P}.emptyEmployees`),
    },
    vacantSupervisor: {
      title: t(`${P}.employeesVacantSupervisor`),
      count: totals?.withVacantSupervisor ?? 0,
      empty: t(`${P}.emptyEmployees`),
    },
    withoutDepartment: {
      title: t(`${P}.employeesNoDepartment`),
      count: totals?.withoutDepartment ?? 0,
      empty: t(`${P}.emptyEmployees`),
    },
    withoutDiscipline: {
      title: t(`${P}.employeesNoDiscipline`),
      count: totals?.withoutDiscipline ?? 0,
      empty: t(`${P}.emptyEmployees`),
    },
    departmentsWithoutLeader: {
      title: t(`${P}.departmentsNoLeader`),
      count: totals?.departmentsWithoutLeader ?? 0,
      empty: t(`${P}.emptyUnits`),
    },
    disciplinesWithoutLeader: {
      title: t(`${P}.disciplinesNoLeader`),
      count: totals?.disciplinesWithoutLeader ?? 0,
      empty: t(`${P}.emptyUnits`),
    },
    supervisorsWithoutAccount: {
      title: t(`${P}.supervisorsNoAccount`),
      count: totals?.supervisorsWithoutAccount ?? 0,
      empty: t(`${P}.emptySupervisors`),
    },
  };

  const active = sectionMeta[section];
  const hasFilters = needle.length > 0;
  const showingEmployees = [
    'withoutSupervisor',
    'vacantSupervisor',
    'withoutDepartment',
    'withoutDiscipline',
  ].includes(section);
  const showingUnits = [
    'departmentsWithoutLeader',
    'disciplinesWithoutLeader',
  ].includes(section);

  if (!canViewHr) {
    return (
      <div
        className={`erp-pro-list-page erp-users-page erp-org-gaps-page ${LIST_PAGE_V2}`}
      >
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (query.isLoading && !data) {
    return (
      <div
        className={`erp-pro-list-page erp-users-page erp-org-gaps-page ${LIST_PAGE_V2}`}
      >
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <div
        className={`erp-pro-list-page erp-users-page erp-org-gaps-page ${LIST_PAGE_V2}`}
      >
        <ErpNotice tone="error" title={t(`${P}.loadError`)} />
      </div>
    );
  }

  return (
    <div
      className={`erp-pro-list-page erp-users-page erp-org-gaps-page ${LIST_PAGE_V2}`}
    >
      <div className="erp-users-stat-bar !grid-cols-2 lg:!grid-cols-4">
        <EvaluationStat
          label={t(`${P}.noSupervisor`)}
          value={totals?.withoutSupervisor ?? 0}
          accent="amber"
          icon={<UserDeleteOutlined />}
          active={section === 'withoutSupervisor'}
          onClick={() => setSection('withoutSupervisor')}
        />
        <EvaluationStat
          label={t(`${P}.vacantSupervisor`)}
          value={totals?.withVacantSupervisor ?? 0}
          accent="red"
          icon={<UserOutlined />}
          active={section === 'vacantSupervisor'}
          onClick={() => setSection('vacantSupervisor')}
        />
        <EvaluationStat
          label={t(`${P}.noDepartment`)}
          value={totals?.withoutDepartment ?? 0}
          accent="blue"
          icon={<ApartmentOutlined />}
          active={section === 'withoutDepartment'}
          onClick={() => setSection('withoutDepartment')}
        />
        <EvaluationStat
          label={t(`${P}.noDiscipline`)}
          value={totals?.withoutDiscipline ?? 0}
          accent="teal"
          icon={<TeamOutlined />}
          active={section === 'withoutDiscipline'}
          onClick={() => setSection('withoutDiscipline')}
        />
        <EvaluationStat
          label={t(`${P}.departmentsNoLeaderStat`)}
          value={totals?.departmentsWithoutLeader ?? 0}
          accent="slate"
          icon={<Building2 size={18} strokeWidth={2} />}
          active={section === 'departmentsWithoutLeader'}
          onClick={() => setSection('departmentsWithoutLeader')}
        />
        <EvaluationStat
          label={t(`${P}.disciplinesNoLeaderStat`)}
          value={totals?.disciplinesWithoutLeader ?? 0}
          accent="slate"
          icon={<GitBranch size={18} strokeWidth={2} />}
          active={section === 'disciplinesWithoutLeader'}
          onClick={() => setSection('disciplinesWithoutLeader')}
        />
        <EvaluationStat
          label={t(`${P}.supervisorsNoAccount`)}
          value={totals?.supervisorsWithoutAccount ?? 0}
          accent="amber"
          icon={<UserRoundX size={18} strokeWidth={2} />}
          active={section === 'supervisorsWithoutAccount'}
          onClick={() => setSection('supervisorsWithoutAccount')}
        />
        <EvaluationStat
          label={t(`${P}.totalEmployees`)}
          value={totals?.employees ?? 0}
          accent="green"
          icon={<Users size={18} strokeWidth={2} />}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="erp-pro-card-toolbar-title m-0">{active.title}</h1>
              <span className="erp-users-count-pill">
                {active.count.toLocaleString()}
              </span>
            </div>
            <p className="m-0 text-[13px] text-slate-600">
              {t(`${P}.description`)}
            </p>
          </div>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={query.isFetching && !query.isLoading}
              onClick={() => void query.refetch()}
              aria-label={t('common.refresh')}
            />
          </Tooltip>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t(`${P}.searchPlaceholder`)}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t(`${P}.searchPlaceholder`)}
          />
          {hasFilters ? (
            <Button
              type="link"
              className="!px-1"
              onClick={() => setSearch('')}
            >
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        {showingEmployees ? (
          <DataTable<OrgGapEmployee>
            className="erp-data-table erp-pro-table erp-users-table"
            rowKey="id"
            size="middle"
            columns={employeeColumns}
            dataSource={employeeRows}
            scroll={{ x: 720 }}
            pagination={
              employeeRows.length > 20
                ? { pageSize: 20, showSizeChanger: false }
                : false
            }
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Users />}
                  title={
                    hasFilters ? t(`${P}.emptyFiltered`) : active.empty
                  }
                />
              ),
            }}
          />
        ) : null}

        {showingUnits ? (
          <DataTable<OrgGapUnit>
            className="erp-data-table erp-pro-table erp-users-table"
            rowKey="id"
            size="middle"
            columns={unitColumns}
            dataSource={unitRows}
            scroll={{ x: 520 }}
            pagination={
              unitRows.length > 20
                ? { pageSize: 20, showSizeChanger: false }
                : false
            }
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<Building2 />}
                  title={
                    hasFilters ? t(`${P}.emptyFiltered`) : active.empty
                  }
                />
              ),
            }}
          />
        ) : null}

        {section === 'supervisorsWithoutAccount' ? (
          supervisorNames.length === 0 ? (
            <div className="px-5 py-10">
              <TableEmptyState
                icon={<UserRoundX />}
                title={
                  hasFilters ? t(`${P}.emptyFiltered`) : active.empty
                }
              />
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-[#eef1f4] px-0 py-0">
              {supervisorNames.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-3 px-5 py-3.5 text-[13px] font-medium text-slate-900"
                >
                  <span
                    className="erp-users-stat-chip !size-8 !rounded-lg !bg-amber-50 !text-amber-700"
                    aria-hidden
                  >
                    <UserRoundX size={14} strokeWidth={2} />
                  </span>
                  {name}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
