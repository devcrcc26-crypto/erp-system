'use client';

import { useMemo } from 'react';
import { Empty, Select, Spin } from 'antd';
import Link from 'next/link';
import dayjs from 'dayjs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DraftItem, DraftModule } from '@/lib/api/drafts.types';

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

interface DraftsPanelProps {
  items: DraftItem[];
  isLoading: boolean;
  module: DraftModule | undefined;
  onModuleChange: (module: DraftModule | undefined) => void;
}

export function DraftsPanel({
  items,
  isLoading,
  module,
  onModuleChange,
}: DraftsPanelProps): React.ReactNode {
  const { t } = useEpcTranslation();

  const moduleOptions = useMemo(
    () =>
      DRAFT_MODULES.map((value) => ({
        value,
        label: t(MODULE_LABEL_KEY[value]),
      })),
    [t],
  );

  function moduleLabel(itemModule: DraftModule): string {
    return t(MODULE_LABEL_KEY[itemModule]);
  }

  return (
    <div className="erp-drafts-panel">
      <div className="erp-drafts-filters">
        <Select
          allowClear
          placeholder={t('pages.approvals.drafts.filterByModule')}
          value={module}
          onChange={(val: DraftModule | undefined) => onModuleChange(val)}
          options={moduleOptions}
          className="erp-drafts-module-select"
        />
      </div>

      {isLoading ? (
        <div className="erp-drafts-loading">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty
          description={t('pages.approvals.drafts.empty')}
          className="erp-drafts-empty"
        />
      ) : (
        <div className="erp-drafts-list">
          <table className="erp-drafts-table">
            <thead>
              <tr>
                <th>{t('pages.approvals.drafts.number')}</th>
                <th>{t('pages.approvals.drafts.module')}</th>
                <th>{t('pages.approvals.drafts.description')}</th>
                <th>{t('pages.approvals.drafts.lastModified')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const href = MODULE_HREF[item.module](item.id);
                return (
                  <tr key={`${item.module}-${item.id}`}>
                    <td>
                      <Link href={href} className="erp-drafts-link">
                        {item.number}
                      </Link>
                    </td>
                    <td>
                      <span className="erp-drafts-module-badge">
                        {moduleLabel(item.module)}
                      </span>
                    </td>
                    <td className="erp-drafts-title">{item.title}</td>
                    <td className="erp-drafts-date">
                      {dayjs(item.updatedAt).format('DD MMM YYYY')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
