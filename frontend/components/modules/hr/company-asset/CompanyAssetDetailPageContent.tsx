'use client';

import { useState } from 'react';
import { Alert, Button, Select, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { AssetStatus } from '@/lib/api/company-asset.types';
import {
  useCompanyAsset,
  useDeleteCompanyAsset,
  useUpdateCompanyAssetStatus,
} from '@/lib/query/company-asset';
import {
  ASSET_STATUS_OPTIONS,
  assetStatusVariant,
  formatAssetStatus,
  getAssetStatusColor,
} from '@/lib/utils/company-asset-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

export default function CompanyAssetDetailPageContent({
  assetId,
}: {
  assetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const detailQuery = useCompanyAsset(assetId);
  const statusMutation = useUpdateCompanyAssetStatus(assetId);
  const deleteMutation = useDeleteCompanyAsset();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AssetStatus | undefined>();

  const asset = detailQuery.data;

  async function handleStatusChange(): Promise<void> {
    if (!pendingStatus) return;
    try {
      await statusMutation.mutateAsync({ status: pendingStatus });
      messageApi.success(t('hr.assetMessages.statusUpdated'));
      setStatusModalOpen(false);
      setPendingStatus(undefined);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.assetMessages.failedToUpdateStatus'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(assetId);
      messageApi.success(t('hr.assetMessages.deleted'));
      router.push('/hr/company-asset');
    } catch (error: unknown) {
      notifyApiError(error, t('hr.assetMessages.failedToDelete'), messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !asset) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.assetMessages.notFound')
        }
        action={
          <Button onClick={() => router.push('/hr/company-asset')}>
            {t('hr.assetButtons.backToList')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/company-asset')}
        >
          {t('hr.assetButtons.back')}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={() => {
              setPendingStatus(asset.status);
              setStatusModalOpen(true);
            }}
          >
            {t('hr.assetButtons.changeStatus')}
          </Button>
          <Button
            onClick={() =>
              router.push(`/hr/company-asset/${assetId}/edit`)
            }
          >
            {t('hr.assetButtons.editAsset')}
          </Button>
          <Button
            danger
            type="primary"
            onClick={() => setConfirmDelete(true)}
          >
            {t('hr.assetButtons.deleteAsset')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: tokens.colorCardBg,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        >
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {asset.serialNumber}
              </span>
              <span style={{ color: tokens.colorBorder }}>|</span>
              <StatusBadge
                label={formatAssetStatus(asset.status, t)}
                variant={assetStatusVariant(asset.status)}
              />
            </div>
            <h2
              className="text-lg font-semibold leading-snug m-0"
              style={{ color: tokens.colorTextPrimary }}
            >
              {asset.brand} {asset.model}
            </h2>
            <p
              className="mt-1 text-sm m-0"
              style={{ color: tokens.colorTextSecondary }}
            >
              {asset.type} | {asset.year} | {asset.color}
            </p>
          </div>
        </div>

        <SummaryStrip
          items={[
            { label: t('hr.assetLabels.brand'), value: asset.brand },
            { label: t('hr.assetLabels.model'), value: asset.model },
            { label: t('hr.assetLabels.year'), value: String(asset.year) },
            { label: t('hr.assetLabels.type'), value: asset.type },
          ]}
        />

        <SectionCard
          title={t('hr.assetSection.assetDetails')}
          bodyClassName="px-5 py-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetaItem label={t('hr.assetLabels.serialNumber')}>
              {asset.serialNumber}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.status')}>
              <StatusBadge
                label={formatAssetStatus(asset.status, t)}
                variant={assetStatusVariant(asset.status)}
              />
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.brand')}>
              {asset.brand}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.model')}>
              {asset.model}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.year')}>
              {asset.year}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.color')}>
              {asset.color}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.type')}>
              {asset.type}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.createdAt')}>
              {formatProjectDate(asset.createdAt)}
            </MetaItem>
            {asset.description ? (
              <MetaItem label={t('hr.assetLabels.description')}>
                <p className="whitespace-pre-wrap leading-relaxed m-0">
                  {asset.description}
                </p>
              </MetaItem>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={statusModalOpen}
        title={t('hr.assetDialog.statusTitle')}
        description=""
        confirmLabel={t('hr.assetButtons.save')}
        confirmLoading={statusMutation.isPending}
        onConfirm={() => void handleStatusChange()}
        onCancel={() => {
          setStatusModalOpen(false);
          setPendingStatus(undefined);
        }}
      >
        <Select
          style={{ width: '100%', marginTop: 8 }}
          value={pendingStatus}
          onChange={setPendingStatus}
          options={ASSET_STATUS_OPTIONS}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.assetDialog.deleteTitle')}
        description={t('hr.assetDialog.deleteDesc')}
        confirmLabel={t('hr.assetButtons.deleteAsset')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
