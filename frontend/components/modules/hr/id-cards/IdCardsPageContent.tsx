'use client';

import '@/components/modules/users/employees-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  IdcardOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanManageUsers } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useIsMdUp } from '@/hooks/useMediaQuery';
import { apiGetPaginated } from '@/lib/api/client';
import type { User } from '@/lib/api/types';
import { useDepartments } from '@/lib/query/org';
import {
  downloadBulkIdCards,
  downloadUserIdCard,
  useIssueIdCard,
  useIssueIdCardsBulk,
  useRevokeIdCard,
  useUsers,
} from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type IssuedFilter = 'all' | 'issued' | 'notIssued';

const PAGE_ROOT =
  'erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2';

/**
 * HR bulk page: select employees, issue/revoke ID cards, print CR80 PDFs.
 */
export default function IdCardsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canManageUsers = useCanManageUsers();
  const isCompact = !useIsMdUp();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [issuedFilter, setIssuedFilter] = useState<IssuedFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);

  const departmentsQuery = useDepartments(
    { page: 1, limit: 100 },
    canManageUsers,
  );
  const listFilters = {
    search: search.trim() || undefined,
    departmentId,
    sortBy: 'lastName' as const,
    sortOrder: 'asc' as const,
    isActive: true,
  };
  const usersQuery = useUsers(
    {
      page,
      limit: 50,
      ...listFilters,
      idCardIssued:
        issuedFilter === 'all' ? undefined : issuedFilter === 'issued',
    },
    { enabled: canManageUsers },
  );
  const allCountQuery = useUsers(
    { page: 1, limit: 1, ...listFilters },
    { enabled: canManageUsers },
  );
  const issuedCountQuery = useUsers(
    { page: 1, limit: 1, ...listFilters, idCardIssued: true },
    { enabled: canManageUsers },
  );
  const notIssuedCountQuery = useUsers(
    { page: 1, limit: 1, ...listFilters, idCardIssued: false },
    { enabled: canManageUsers },
  );

  const issueOne = useIssueIdCard();
  const revokeOne = useRevokeIdCard();
  const issueBulk = useIssueIdCardsBulk();

  const rows = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const unissuedSelected = selectedRows.filter((row) => !row.idCardIssued);
  const statusCounts = {
    all: allCountQuery.data?.meta.total ?? meta?.total ?? 0,
    issued: issuedCountQuery.data?.meta.total ?? 0,
    notIssued: notIssuedCountQuery.data?.meta.total ?? 0,
  };

  const setFilter = (next: IssuedFilter): void => {
    setIssuedFilter(next);
    setPage(1);
    setSelectedIds([]);
  };

  const printSelected = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      messageApi.warning(t('users.idCard.noneSelected'));
      return;
    }
    setPrinting(true);
    try {
      await downloadBulkIdCards(
        selectedIds,
        `id-cards-${selectedIds.length}.pdf`,
      );
      messageApi.success(t('users.idCard.printSuccess'));
    } catch (error: unknown) {
      notifyApiError(error, t('users.idCard.generating'), messageApi, t);
    } finally {
      setPrinting(false);
    }
  };

  const printAllMatching = async (): Promise<void> => {
    setPrinting(true);
    try {
      const allIds: string[] = [];
      let current = 1;
      let pages = 1;
      do {
        const params = new URLSearchParams({
          page: String(current),
          limit: '100',
          sortBy: 'lastName',
          sortOrder: 'asc',
          isActive: 'true',
        });
        if (departmentId) params.set('departmentId', departmentId);
        if (search.trim()) params.set('search', search.trim());
        if (issuedFilter === 'issued') params.set('idCardIssued', 'true');
        if (issuedFilter === 'notIssued') params.set('idCardIssued', 'false');
        const result = await apiGetPaginated<User>(`/users?${params.toString()}`);
        allIds.push(...result.data.map((user) => user.id));
        pages = result.meta.pages;
        current += 1;
      } while (current <= pages);

      if (allIds.length === 0) {
        messageApi.warning(t('users.idCard.noneSelected'));
        return;
      }
      await downloadBulkIdCards(allIds, `id-cards-all-${allIds.length}.pdf`);
      messageApi.success(t('users.idCard.printSuccess'));
    } catch (error: unknown) {
      notifyApiError(error, t('users.idCard.generating'), messageApi, t);
    } finally {
      setPrinting(false);
    }
  };

  const columns: ColumnsType<User> = useMemo(
    () => [
      {
        title: (
          <Checkbox
            aria-label={t('users.idCard.selectAll')}
            checked={
              rows.length > 0 &&
              rows.every((row) => selectedIds.includes(row.id))
            }
            indeterminate={
              selectedIds.length > 0 &&
              !rows.every((row) => selectedIds.includes(row.id))
            }
            onChange={(event) => {
              if (event.target.checked) {
                setSelectedIds((prev) => [
                  ...new Set([...prev, ...rows.map((row) => row.id)]),
                ]);
              } else {
                const pageIds = new Set(rows.map((row) => row.id));
                setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
              }
            }}
          />
        ),
        key: 'select',
        width: 48,
        render: (_: unknown, record: User) => (
          <Checkbox
            checked={selectedIds.includes(record.id)}
            onChange={(event) => {
              setSelectedIds((prev) =>
                event.target.checked
                  ? [...prev, record.id]
                  : prev.filter((id) => id !== record.id),
              );
            }}
          />
        ),
      },
      {
        title: '',
        key: 'photo',
        width: 56,
        render: (_: unknown, record: User) => (
          <EmployeeProfilePhoto
            userId={record.id}
            photoDocumentId={record.photoDocumentId}
            firstName={record.firstName}
            lastName={record.lastName}
            canEdit={false}
            size={36}
            variant="hero"
          />
        ),
      },
      {
        title: t('users.form.fullName'),
        key: 'name',
        render: (_: unknown, record: User) => (
          <span className="erp-users-name">{formatUserName(record)}</span>
        ),
      },
      {
        title: t('users.form.employeeId'),
        dataIndex: 'employeeId',
        key: 'employeeId',
        width: 130,
        render: (value: string | null | undefined) =>
          value ? (
            <span className="erp-users-id-chip">{value}</span>
          ) : (
            <span className="erp-users-cell-sub">—</span>
          ),
      },
      {
        title: t('users.form.department'),
        key: 'department',
        render: (_: unknown, record: User) => (
          <span className="erp-users-cell-sub">
            {record.department?.name ?? '—'}
          </span>
        ),
      },
      {
        title: t('users.form.position'),
        key: 'position',
        render: (_: unknown, record: User) => (
          <span className="erp-users-cell-sub">
            {record.position?.title ?? '—'}
          </span>
        ),
      },
      {
        title: t('users.idCard.sectionTitle'),
        key: 'issued',
        width: 120,
        render: (_: unknown, record: User) =>
          record.idCardIssued ? (
            <StatusBadge label={t('users.idCard.issued')} variant="success" />
          ) : (
            <StatusBadge label={t('users.idCard.notIssued')} variant="default" />
          ),
      },
      {
        title: t('common.actions'),
        key: 'actions',
        width: 220,
        render: (_: unknown, record: User) => (
          <Space size={4} wrap>
            <Tooltip title={t('users.idCard.print')}>
              <Button
                type="text"
                size="small"
                icon={<PrinterOutlined />}
                disabled={printing}
                aria-label={t('users.idCard.print')}
                onClick={() => {
                  void (async () => {
                    setPrinting(true);
                    try {
                      const code =
                        record.employeeId?.trim() || record.id.slice(0, 8);
                      await downloadUserIdCard(
                        record.id,
                        `${code}-id-card.pdf`,
                      );
                      messageApi.success(t('users.idCard.printSuccess'));
                    } catch (error: unknown) {
                      notifyApiError(
                        error,
                        t('users.idCard.generating'),
                        messageApi,
                        t,
                      );
                    } finally {
                      setPrinting(false);
                    }
                  })();
                }}
              />
            </Tooltip>
            {record.idCardIssued ? (
              <Button
                size="small"
                danger
                loading={revokeOne.isPending}
                onClick={() => {
                  Modal.confirm({
                    title: t('users.idCard.revokeConfirmTitle'),
                    content: t('users.idCard.revokeConfirm'),
                    okText: t('users.idCard.revoke'),
                    okButtonProps: { danger: true },
                    onOk: () =>
                      revokeOne
                        .mutateAsync(record.id)
                        .then(() =>
                          messageApi.success(t('users.idCard.revokeSuccess')),
                        )
                        .catch((error: unknown) =>
                          notifyApiError(
                            error,
                            t('users.idCard.revoke'),
                            messageApi,
                            t,
                          ),
                        ),
                  });
                }}
              >
                {t('users.idCard.revoke')}
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                loading={issueOne.isPending}
                onClick={() => {
                  void issueOne
                    .mutateAsync(record.id)
                    .then(() =>
                      messageApi.success(t('users.idCard.issueSuccess')),
                    )
                    .catch((error: unknown) =>
                      notifyApiError(
                        error,
                        t('users.idCard.issue'),
                        messageApi,
                        t,
                      ),
                    );
                }}
              >
                {t('users.idCard.issue')}
              </Button>
            )}
          </Space>
        ),
      },
    ],
    [issueOne, messageApi, printing, revokeOne, rows, selectedIds, t],
  );

  if (!canManageUsers) {
    return null;
  }

  return (
    <div className={PAGE_ROOT}>
      <section
        className="erp-employees-hero"
        aria-labelledby="erp-id-cards-hero-title"
      >
        <div className="erp-employees-hero-top">
          <div className="min-w-0">
            <h2 id="erp-id-cards-hero-title" className="erp-employees-hero-title">
              {t('pages.hr.listHeroTitle', {
                title: t('users.idCard.pageTitle'),
                count: statusCounts.all.toLocaleString(),
              })}
            </h2>
            <p className="mt-1 text-sm text-white/75">
              {t('users.idCard.pageDescription')}
            </p>
          </div>
          <div className="erp-employees-hero-actions">
            <Space wrap>
              <Button
                disabled={unissuedSelected.length === 0 || issueBulk.isPending}
                loading={issueBulk.isPending}
                onClick={() => {
                  void issueBulk
                    .mutateAsync(unissuedSelected.map((row) => row.id))
                    .then((result) => {
                      messageApi.success(
                        t('users.idCard.issuedCount', { count: result.issued }),
                      );
                      setSelectedIds([]);
                    })
                    .catch((error: unknown) =>
                      notifyApiError(
                        error,
                        t('users.idCard.issueSelected'),
                        messageApi,
                        t,
                      ),
                    );
                }}
              >
                {isCompact ? t('users.idCard.issue') : t('users.idCard.issueSelected')}
              </Button>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                disabled={selectedIds.length === 0 || printing}
                loading={printing}
                onClick={() => {
                  void printSelected();
                }}
              >
                {isCompact
                  ? t('users.idCard.print')
                  : t('users.idCard.printSelected')}
              </Button>
              <Button
                icon={<PrinterOutlined />}
                disabled={printing}
                loading={printing}
                onClick={() => {
                  void printAllMatching();
                }}
              >
                {t('users.idCard.printAll')}
              </Button>
            </Space>
          </div>
        </div>
        <div className="erp-users-stat-bar erp-employees-hero-stats">
          <EvaluationStat
            label={t('users.idCard.filterAll')}
            value={statusCounts.all}
            accent="teal"
            icon={<TeamOutlined />}
            active={issuedFilter === 'all'}
            onClick={() => setFilter('all')}
          />
          <EvaluationStat
            label={t('users.idCard.filterIssued')}
            value={statusCounts.issued}
            accent="green"
            icon={<CheckCircleOutlined />}
            active={issuedFilter === 'issued'}
            onClick={() => setFilter('issued')}
          />
          <EvaluationStat
            label={t('users.idCard.filterNotIssued')}
            value={statusCounts.notIssued}
            accent="amber"
            icon={<CloseCircleOutlined />}
            active={issuedFilter === 'notIssued'}
            onClick={() => setFilter('notIssued')}
          />
        </div>
      </section>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <IdcardOutlined />
            </span>
            <h3 className="erp-pro-card-toolbar-title">
              {t('users.idCard.pageTitle')}
            </h3>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={usersQuery.isFetching && !usersQuery.isLoading}
                onClick={() => {
                  void usersQuery.refetch();
                  void allCountQuery.refetch();
                  void issuedCountQuery.refetch();
                  void notIssuedCountQuery.refetch();
                }}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('common.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="erp-users-search-input max-w-xs"
          />
          <Select
            allowClear
            placeholder={t('users.form.department')}
            className="erp-users-filter-select min-w-[200px]"
            value={departmentId}
            onChange={(value) => {
              setDepartmentId(value);
              setPage(1);
            }}
            options={(departmentsQuery.data?.data ?? []).map((dept) => ({
              value: dept.id,
              label: dept.name,
            }))}
          />
        </div>

        {printing ? (
          <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
            {t('users.idCard.generating')}
          </div>
        ) : null}

        <div className="erp-pro-table-card-body">
          <Table<User>
            className="erp-pro-table"
            rowKey="id"
            loading={usersQuery.isLoading || usersQuery.isFetching}
            columns={columns}
            dataSource={rows}
            pagination={{
              current: page,
              pageSize: 50,
              total: meta?.total ?? 0,
              onChange: (next) => setPage(next),
              showSizeChanger: false,
            }}
            scroll={{ x: 960 }}
          />
        </div>
      </div>
    </div>
  );
}
