'use client';

import { useMemo } from 'react';
import { Button, Grid, Select, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  FormOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type { DraftItem, DraftModule } from '@/lib/api/drafts.types';
import type { PaginationMeta } from '@/lib/api/types';
import { editRequestHref } from '@/lib/utils/request-edit';

const DRAFT_MODULES: DraftModule[] = [
  'leave',
  'expense-claim',
  'per-diem',
  'consumables',
  'exit-permit',
  'purchase-request',
  'material-requisition',
  'vehicle-application',
  'vehicle-refueling',
  'official-seal',
  'project-seal',
  'flight',
  'business-trip',
  'overtime',
];

const MODULE_LABEL_KEY: Record<DraftModule, string> = {
  leave: 'pages.approvals.categories.LEAVE_REQUEST.name',
  'expense-claim': 'pages.approvals.categories.EXPENSE_CLAIM.name',
  'per-diem': 'pages.approvals.categories.PER_DIEM.name',
  consumables: 'pages.approvals.categories.CONSUMABLES_REQUISITION.name',
  'exit-permit': 'pages.approvals.categories.EXIT_PERMIT.name',
  'purchase-request': 'pages.approvals.categories.PURCHASE_REQUEST.name',
  'material-requisition': 'pages.approvals.categories.MATERIAL_REQUISITION.name',
  'vehicle-application': 'pages.approvals.categories.VEHICLE_APPLICATION.name',
  'vehicle-refueling': 'pages.approvals.categories.VEHICLE_REFUELING.name',
  'official-seal': 'pages.approvals.categories.OFFICIAL_SEAL_USAGE.name',
  'project-seal': 'pages.approvals.categories.PROJECT_SEAL_USAGE.name',
  flight: 'pages.approvals.categories.FLIGHT_APPLICATION.name',
  'business-trip': 'pages.approvals.categories.BUSINESS_TRIP.name',
  overtime: 'pages.approvals.categories.OVERTIME_APPLICATION.name',
};

const MODULE_HREF: Record<DraftModule, (id: string) => string> = {
  leave: (id) => `/hr/leave-requests/${id}`,
  'expense-claim': (id) => `/hr/expense-claims/${id}`,
  'per-diem': (id) => `/hr/per-diem/${id}`,
  consumables: (id) => `/hr/consumables/${id}`,
  'exit-permit': (id) => `/hr/equipment-and-materials-exit-permit/${id}`,
  'purchase-request': (id) => `/hr/purchase-requests/${id}`,
  'material-requisition': (id) => `/hr/material-requisition/${id}`,
  'vehicle-application': (id) => `/hr/vehicle-applications/${id}`,
  'vehicle-refueling': (id) => `/hr/vehicle-refueling/${id}`,
  'official-seal': (id) => `/hr/official-seal/${id}`,
  'project-seal': (id) => `/hr/project-seal/${id}`,
  flight: (id) => `/hr/flight-applications/${id}`,
  'business-trip': (id) => `/hr/business-trips/${id}`,
  overtime: (id) => `/hr/overtime/${id}`,
};

/** Draft module → approval category, for the employee edit page. */
const MODULE_CATEGORY: Partial<Record<DraftModule, string>> = {
  leave: 'LEAVE_REQUEST',
  'expense-claim': 'EXPENSE_CLAIM',
  'per-diem': 'PER_DIEM',
  'exit-permit': 'EXIT_PERMIT',
  'material-requisition': 'MATERIAL_REQUISITION',
  'vehicle-application': 'VEHICLE_APPLICATION',
  flight: 'FLIGHT_APPLICATION',
  'business-trip': 'BUSINESS_TRIP',
  overtime: 'OVERTIME_APPLICATION',
};

interface DraftsPanelProps {
  items: DraftItem[];
  isLoading: boolean;
  isFetching: boolean;
  module: DraftModule | undefined;
  onModuleChange: (module: DraftModule | undefined) => void;
  onRefresh: () => void;
  onNewRequest: () => void;
  pageDescription: string;
}

export function DraftsPanel({
  items,
  isLoading,
  isFetching,
  module,
  onModuleChange,
  onRefresh,
  onNewRequest,
  pageDescription,
}: DraftsPanelProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [items],
  );

  const meta: PaginationMeta = useMemo(() => {
    const total = sortedItems.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [sortedItems.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return sortedItems.slice(start, start + meta.limit);
  }, [sortedItems, meta.page, meta.limit]);

  const moduleOptions = useMemo(
    () =>
      DRAFT_MODULES.map((value) => ({
        value,
        label: t(MODULE_LABEL_KEY[value]),
      })),
    [t],
  );

  const hasModuleFilter = Boolean(module);

  const columns: ColumnsType<DraftItem> = useMemo(
    () => [
      {
        title: t('pages.approvals.table.requestNumber'),
        dataIndex: 'number',
        key: 'number',
        width: 140,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('pages.approvals.table.title'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (value: string, row: DraftItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{value}</p>
            {isNarrow ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
                {row.number}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('pages.approvals.table.category'),
        key: 'module',
        width: 180,
        responsive: ['md'],
        render: (_: unknown, row: DraftItem) => (
          <span className="erp-users-cell-sub">
            {t(MODULE_LABEL_KEY[row.module])}
          </span>
        ),
      },
      {
        title: t('pages.approvals.drafts.lastModified'),
        key: 'updatedAt',
        width: 120,
        responsive: ['lg'],
        render: (_: unknown, row: DraftItem) => (
          <span className="erp-users-cell-sub">
            {dayjs(row.updatedAt).format('DD MMM YYYY')}
          </span>
        ),
      },
      {
        title: t('pages.approvals.table.status'),
        key: 'status',
        width: isNarrow ? 110 : 120,
        render: () => (
          <StatusBadge label={t('pages.approvals.drafts.statusDraft')} variant="default" />
        ),
      },
      {
        title: (
          <span className="sr-only">{t('pages.approvals.edit.button')}</span>
        ),
        key: 'edit',
        width: isNarrow ? 56 : 96,
        align: 'right',
        render: (_: unknown, row: DraftItem) => {
          // Drafts listed here are always the current user's own.
          const href = editRequestHref(MODULE_CATEGORY[row.module], row.id, row.id);
          if (!href) {
            return null;
          }
          return (
            <Button
              size="small"
              icon={<EditOutlined />}
              aria-label={t('pages.approvals.edit.buttonAria', {
                number: row.number,
              })}
              onClick={(event) => {
                // Row click opens the detail page.
                event.stopPropagation();
                router.push(href);
              }}
            >
              {isNarrow ? undefined : t('pages.approvals.edit.button')}
            </Button>
          );
        },
      },
    ],
    [isNarrow, router, t],
  );

  return (
    <div className="erp-pro-card">
      <div className="erp-pro-card-toolbar erp-users-toolbar">
        <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
          <h3 className="erp-pro-card-toolbar-title">
            {t('pages.approvals.tabs.myDrafts')}
          </h3>
          <span className="erp-users-count-pill">
            {meta.total.toLocaleString()}
          </span>
        </div>
        <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={isFetching && !isLoading}
              onClick={onRefresh}
              aria-label={t('common.refresh')}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onNewRequest}
            aria-label={t('pages.approvals.newRequest')}
          >
            {isNarrow ? undefined : t('pages.approvals.newRequest')}
          </Button>
        </div>
      </div>

      <div className="erp-users-filter-bar">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('pages.approvals.drafts.filterByModule')}
          className="erp-users-filter-select"
          options={moduleOptions}
          value={module}
          onChange={(value: DraftModule | undefined) => {
            onModuleChange(value);
            resetPage();
          }}
        />
        {hasModuleFilter ? (
          <Button
            type="link"
            onClick={() => {
              onModuleChange(undefined);
              resetPage();
            }}
            className="!px-1"
          >
            {t('common.reset')}
          </Button>
        ) : null}
      </div>

      <div className="erp-pro-table-card-body">
        <DataTable<DraftItem>
          rowKey={(row) => `${row.module}-${row.id}`}
          className="erp-pro-table erp-users-table"
          size={isCompact ? 'small' : 'middle'}
          columns={columns}
          dataSource={rows}
          loading={isLoading && rows.length === 0}
          scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1100 }}
          onRow={(record) => ({
            onClick: () => router.push(MODULE_HREF[record.module](record.id)),
            className: 'cursor-pointer',
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<FormOutlined />}
                title={
                  hasModuleFilter
                    ? t('pages.approvals.drafts.emptyFiltered')
                    : t('pages.approvals.drafts.empty')
                }
                description={pageDescription}
                action={
                  hasModuleFilter
                    ? {
                        label: t('common.reset'),
                        onClick: () => {
                          onModuleChange(undefined);
                          resetPage();
                        },
                      }
                    : {
                        label: t('pages.approvals.newRequest'),
                        onClick: onNewRequest,
                      }
                }
              />
            ),
          }}
          pagination={{
            ...bindMeta(meta),
            pageSizeOptions: ['10', '20', '50', '100'],
            simple: isNarrow,
            showSizeChanger: !isNarrow,
          }}
        />
      </div>
    </div>
  );
}
