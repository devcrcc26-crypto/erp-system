'use client';

import { useMemo } from 'react';
import { Alert, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Package } from 'lucide-react';
import CompanyAssetPhoto from '@/components/modules/hr/company-asset/CompanyAssetPhoto';
import {
  ProfileEmptyState,
  ProfileSection,
} from '@/components/modules/profile/profile-display';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { CompanyAssetListItem } from '@/lib/api/company-asset.types';
import { useMyCompanyAssets } from '@/lib/query/company-asset';
import {
  assetStatusVariant,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import { formatDateWithPattern } from '@/lib/utils/date-format';

/**
 * My Profile → Assets: company assets currently assigned to the employee.
 */
export default function ProfileAssetsTab({
  dateFormat,
}: {
  dateFormat: string | null | undefined;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const assetsQuery = useMyCompanyAssets();
  const assets = assetsQuery.data ?? [];

  const columns: ColumnsType<CompanyAssetListItem> = useMemo(
    () => [
      {
        title: t('hr.assetLabels.photo'),
        key: 'photo',
        width: 56,
        render: (_: unknown, row: CompanyAssetListItem) => (
          <CompanyAssetPhoto
            assetId={row.id}
            photoDocumentId={row.photoDocumentId}
            label={row.serialNumber}
            canEdit={false}
            variant="thumb"
            size={40}
          />
        ),
      },
      {
        title: t('hr.assetLabels.assetName'),
        key: 'assetName',
        ellipsis: true,
        render: (_: unknown, row: CompanyAssetListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">
              {row.assetName?.trim() ||
                `${row.brand} ${row.model}`.trim() ||
                row.serialNumber}
            </p>
            {row.assetCode ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
                {row.assetCode}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.assetLabels.serialNumber'),
        dataIndex: 'serialNumber',
        key: 'serialNumber',
        width: 140,
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('hr.assetLabels.type'),
        dataIndex: 'type',
        key: 'type',
        width: 120,
        responsive: ['md'],
        ellipsis: true,
      },
      {
        title: t('hr.assetLabels.status'),
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (value: string) => (
          <StatusBadge
            label={formatAssetStatus(value, t)}
            variant={assetStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.assetLabels.assignedAt'),
        dataIndex: 'assignedAt',
        key: 'assignedAt',
        width: 130,
        responsive: ['sm'],
        render: (value: string | null | undefined) =>
          value ? formatDateWithPattern(value, dateFormat) : '-',
      },
    ],
    [dateFormat, t],
  );

  return (
    <ProfileSection title={t('profile.assetsTitle')}>
      {assetsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : assetsQuery.isError ? (
        <Alert type="error" showIcon title={t('profile.assetsLoadError')} />
      ) : assets.length === 0 ? (
        <ProfileEmptyState
          icon={<Package size={22} strokeWidth={1.6} />}
          message={t('profile.noAssets')}
        />
      ) : (
        <DataTable<CompanyAssetListItem>
          rowKey="id"
          className="erp-pro-table erp-users-table"
          size="small"
          columns={columns}
          dataSource={assets}
          pagination={false}
          scroll={false}
        />
      )}
    </ProfileSection>
  );
}
