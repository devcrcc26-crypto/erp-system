'use client';

import './attendance-v2.css';

import { useMemo, useState } from 'react';
import { Alert, App, Button, Input, Select, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { ArrowLeft, Fingerprint, Link2, Pencil, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  listAttendanceIdentities,
  searchAttendanceEmployees,
  updateAttendanceIdentity,
} from '@/lib/api/attendance.api';
import type {
  AttendanceEmployeeSearchResult,
  AttendanceIdentity,
  AttendanceIdentityStatus,
} from '@/lib/api/attendance.types';
import { ApiRequestError } from '@/lib/api/errors';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { formatUserName } from '@/lib/utils/user-display';

type StatusFilter = AttendanceIdentityStatus | 'ALL';

const IDENTITIES_KEY = ['attendance-identities'] as const;
const PAGE_V2 = `erp-pro-list-page erp-users-page erp-attendance-v2 ${LIST_PAGE_V2}`;

/**
 * HR maintenance page for attendance-machine identities: which machine name /
 * ID maps to which ERP employee, and which were ignored.
 */
export default function AttendanceIdentitiesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    AttendanceEmployeeSearchResult[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // One list for every status, so the tiles can show all three counts.
  const identitiesQuery = useQuery({
    queryKey: IDENTITIES_KEY,
    queryFn: () => listAttendanceIdentities(),
  });
  const all = useMemo(() => identitiesQuery.data ?? [], [identitiesQuery.data]);

  const counts = useMemo(
    () => ({
      ALL: all.length,
      MAPPED: all.filter((row) => row.status === 'MAPPED').length,
      IGNORED: all.filter((row) => row.status === 'IGNORED').length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [
        row.attendanceName,
        row.attendanceId,
        row.user ? formatUserName(row.user) : '',
        row.user?.employeeId ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [all, search, statusFilter]);

  function startEditing(id: string): void {
    setSearchResults([]);
    setEditingId(id);
  }

  async function runEmployeeSearch(query: string): Promise<void> {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await searchAttendanceEmployees(query));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function mapIdentity(id: string, userId: string): Promise<void> {
    setSavingId(id);
    try {
      await updateAttendanceIdentity(id, { status: 'MAPPED', userId });
      message.success(t('pages.hr.attendance.identities.updated'));
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: IDENTITIES_KEY });
    } catch (error) {
      message.error(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.hr.attendance.identities.updateFailed'),
      );
    } finally {
      setSavingId(null);
    }
  }

  const columns: ColumnsType<AttendanceIdentity> = [
    {
      title: t('pages.hr.attendance.identities.colDevice'),
      key: 'device',
      width: 220,
      render: (_: unknown, row: AttendanceIdentity) => {
        const hasId = row.attendanceId && row.attendanceId !== '-';
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold text-slate-900">
              {row.attendanceName}
            </span>
            <span className="text-xs text-slate-600">
              {hasId
                ? t('pages.hr.attendance.identities.deviceId', {
                    id: row.attendanceId,
                  })
                : t('pages.hr.attendance.identities.noDeviceId')}
            </span>
          </div>
        );
      },
    },
    {
      title: t('pages.hr.attendance.identities.colStatus'),
      key: 'status',
      width: 110,
      render: (_: unknown, row: AttendanceIdentity) => (
        <span
          className={
            row.status === 'MAPPED'
              ? 'erp-users-role-tag'
              : 'erp-users-id-chip'
          }
        >
          {t(`pages.hr.attendance.identities.status${row.status}`)}
        </span>
      ),
    },
    {
      title: t('pages.hr.attendance.identities.colEmployee'),
      key: 'employee',
      width: 280,
      render: (_: unknown, row: AttendanceIdentity) => {
        if (editingId === row.id) {
          return (
            <div className="flex items-center gap-1.5">
              <Select
                showSearch
                autoFocus
                defaultOpen
                className="min-w-0 flex-1 [&_.ant-select-selector]:!rounded-[10px]"
                placeholder={t(
                  'pages.hr.attendance.importModal.searchEmployeePlaceholder',
                )}
                filterOption={false}
                notFoundContent={
                  searching ? null : (
                    <span className="block px-1 py-1.5 text-[13px] text-slate-600">
                      {t('pages.hr.attendance.identities.typeToSearch')}
                    </span>
                  )
                }
                loading={searching || savingId === row.id}
                disabled={savingId === row.id}
                options={searchResults.map((employee) => ({
                  value: employee.id,
                  label: `${formatUserName(employee)}${
                    employee.employeeId ? ` · ${employee.employeeId}` : ''
                  }`,
                }))}
                onSearch={(query) => void runEmployeeSearch(query)}
                onSelect={(userId: string) => void mapIdentity(row.id, userId)}
                aria-label={t('pages.hr.attendance.identities.colEmployee')}
              />
              <Tooltip title={t('common.cancel')}>
                <Button
                  type="text"
                  size="small"
                  icon={<X size={15} />}
                  onClick={() => setEditingId(null)}
                  aria-label={t('common.cancel')}
                />
              </Tooltip>
            </div>
          );
        }
        if (!row.user) {
          return (
            <span className="text-[13px] text-slate-500">
              {t('pages.hr.attendance.identities.notMapped')}
            </span>
          );
        }
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium text-slate-900">
              {formatUserName(row.user)}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {row.user.employeeId ? (
                <span className="erp-users-id-chip">{row.user.employeeId}</span>
              ) : null}
              {row.user.isActive === false ? (
                <span className="rounded-full bg-amber-50 px-2 py-px text-xs font-medium text-amber-800">
                  {t('pages.hr.attendance.identities.inactive')}
                </span>
              ) : null}
            </span>
          </div>
        );
      },
    },
    {
      title: t('pages.hr.attendance.identities.colReason'),
      key: 'reason',
      render: (_: unknown, row: AttendanceIdentity) =>
        row.reason ? (
          <span className="text-[13px] text-slate-700">{row.reason}</span>
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
    {
      title: t('pages.hr.attendance.identities.colDecided'),
      key: 'decided',
      width: 150,
      render: (_: unknown, row: AttendanceIdentity) => (
        <div className="flex flex-col gap-0.5 text-xs text-slate-600">
          <span className="text-[13px] text-slate-900">
            {formatDisplayDate(row.decidedAt)}
          </span>
          {row.decider ? (
            <span>
              {t('pages.hr.attendance.identities.decidedBy', {
                name: formatUserName(row.decider),
              })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: t('pages.hr.attendance.identities.colActions'),
      key: 'actions',
      width: 170,
      render: (_: unknown, row: AttendanceIdentity) =>
        editingId === row.id ? null : (
          <Button
            size="small"
            className="!rounded-lg"
            icon={
              row.status === 'IGNORED' ? <Link2 size={14} /> : <Pencil size={13} />
            }
            onClick={() => startEditing(row.id)}
          >
            {row.status === 'IGNORED'
              ? t('pages.hr.attendance.identities.mapToEmployee')
              : t('pages.hr.attendance.identities.changeEmployee')}
          </Button>
        ),
    },
  ];

  const hasFilters = statusFilter !== 'ALL' || search.trim().length > 0;

  return (
    <div className={PAGE_V2}>
      <Link
        href="/hr/attendance"
        className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium !text-slate-500 hover:!text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        <ArrowLeft size={15} aria-hidden />
        {t('pages.hr.attendance.identities.back')}
      </Link>

      {identitiesQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="!rounded-xl"
          title={
            identitiesQuery.error instanceof ApiRequestError
              ? identitiesQuery.error.message
              : t('pages.hr.attendance.identities.loadFailed')
          }
        />
      ) : null}

      <div className="erp-users-stat-bar !grid-cols-1 sm:!grid-cols-3">
        <EvaluationStat
          label={t('pages.hr.attendance.identities.statAll')}
          value={counts.ALL}
          accent="slate"
          icon={<Fingerprint size={18} strokeWidth={2} />}
          active={statusFilter === 'ALL'}
          onClick={() => setStatusFilter('ALL')}
        />
        <EvaluationStat
          label={t('pages.hr.attendance.identities.statMapped')}
          value={counts.MAPPED}
          accent="green"
          icon={<LinkOutlined />}
          active={statusFilter === 'MAPPED'}
          onClick={() => setStatusFilter('MAPPED')}
        />
        <EvaluationStat
          label={t('pages.hr.attendance.identities.statIgnored')}
          value={counts.IGNORED}
          accent="amber"
          icon={<StopOutlined />}
          active={statusFilter === 'IGNORED'}
          onClick={() => setStatusFilter('IGNORED')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="erp-pro-card-toolbar-title m-0">
                {t('pages.hr.attendance.identities.title')}
              </h1>
              <span className="erp-users-count-pill">
                {rows.length.toLocaleString()}
              </span>
            </div>
            <p className="m-0 text-[13px] text-slate-600">
              {t('pages.hr.attendance.identities.description')}
            </p>
          </div>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={identitiesQuery.isFetching && !identitiesQuery.isLoading}
              onClick={() => void identitiesQuery.refetch()}
              aria-label={t('common.refresh')}
            />
          </Tooltip>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.attendance.identities.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('pages.hr.attendance.identities.searchPlaceholder')}
          />
          {hasFilters ? (
            <Button
              type="link"
              className="!px-1"
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
              }}
            >
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <Table<AttendanceIdentity>
          className="erp-data-table erp-pro-table erp-users-table"
          rowKey="id"
          size="middle"
          loading={identitiesQuery.isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1000 }}
          pagination={
            rows.length > 20
              ? { pageSize: 20, showSizeChanger: false }
              : false
          }
          locale={{
            emptyText: (
              <div className="flex flex-col items-center gap-1 py-10 text-center">
                <span className="text-sm font-semibold text-slate-900">
                  {hasFilters
                    ? t('pages.hr.attendance.identities.emptyFiltered')
                    : t('pages.hr.attendance.identities.emptyTitle')}
                </span>
                {hasFilters ? null : (
                  <span className="text-[13px] text-slate-600">
                    {t('pages.hr.attendance.identities.emptyDescription')}
                  </span>
                )}
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
