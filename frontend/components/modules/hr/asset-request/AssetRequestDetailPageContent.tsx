'use client';

import { useMemo, useState } from 'react';
import { Button, Dropdown, Grid, Skeleton } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, StopOutlined } from '@ant-design/icons';
import { ArrowLeft, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  useCancelAssetRequest,
  useFulfillAssetRequest,
  useAssetRequest,
  useSubmitAssetRequest,
} from '@/lib/query/asset-request';
import { useCurrentUser } from '@/lib/query/profile';
import {
  assetRequestStatusVariant,
  formatAssetRequestEmployeeName,
  formatAssetRequestStatus,
} from '@/lib/utils/asset-request-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';

function DetailSection({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className="erp-employee-section-body">{children}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className="erp-users-stat-label mb-0.5">{label}</p>
      <p className="erp-users-cell-strong m-0 text-sm">{value || '—'}</p>
    </div>
  );
}

export default function AssetRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();

  const detailQuery = useAssetRequest(requestId);
  const cancelMutation = useCancelAssetRequest(requestId);
  const submitMutation = useSubmitAssetRequest(requestId);
  const fulfillMutation = useFulfillAssetRequest(requestId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isOwner = Boolean(request) && request?.employeeId === currentUser.data?.id;
  const canSubmit = isOwner && request?.status === 'DRAFT';
  const canCancel =
    (isOwner || canViewHr) &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');
  const canFulfill = canViewHr && request?.status === 'APPROVED';

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  async function handleSubmit(): Promise<void> {
    try {
      await submitMutation.mutateAsync();
      messageApi.success('Asset request submitted');
      setConfirmSubmit(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit', messageApi, t);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Asset request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel', messageApi, t);
    }
  }

  async function handleFulfill(): Promise<void> {
    try {
      await fulfillMutation.mutateAsync({});
      messageApi.success('Asset request marked as fulfilled');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to fulfil', messageApi, t);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(detailQuery.error, 'Asset request not found', t)}
          action={
            <Button onClick={() => router.push('/hr/asset-requests')}>Back</Button>
          }
        />
      </div>
    );
  }

  const overflowItems: MenuProps['items'] = [];
  if (request.approvalRequestId) {
    overflowItems.push({
      key: 'approvals',
      label: 'View in Approvals',
      onClick: () => router.push(`/approvals/${request.approvalRequestId}`),
    });
  }
  if (canFulfill) {
    overflowItems.push({
      key: 'fulfill',
      label: 'Mark as Fulfilled',
      onClick: handleFulfill,
    });
  }
  if (canCancel) {
    overflowItems.push({
      key: 'cancel',
      label: 'Cancel Request',
      icon: <StopOutlined />,
      danger: true,
      onClick: () => setConfirmCancel(true),
    });
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        {/* Toolbar */}
        <div className="erp-employee-toolbar flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            onClick={() => router.push('/hr/asset-requests')}
          >
            <ArrowLeft size={15} />
            Asset Requests
          </button>
          <div className="flex items-center gap-2">
            {canSubmit ? (
              <Button type="primary" onClick={() => setConfirmSubmit(true)}>
                Submit for Approval
              </Button>
            ) : null}
            {!isNarrow && overflowItems.length > 0 ? (
              <Dropdown menu={{ items: overflowItems }} placement="bottomRight">
                <Button icon={<MoreOutlined />} />
              </Dropdown>
            ) : null}
          </div>
        </div>

        {/* Hero */}
        <div className="erp-employee-hero">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: '#E1F5EE', color: '#1D9E75' }}
            >
              <Package size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="erp-employee-hero-name m-0">{request.assetCategory}</h2>
                <StatusBadge
                  label={formatAssetRequestStatus(request.status)}
                  variant={assetRequestStatusVariant(request.status)}
                />
              </div>
              <p className="erp-users-cell-sub mt-1 text-sm">
                {request.requestNumber}
                {request.assetType ? ` · ${request.assetType}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="erp-employee-meta-bar grid grid-cols-2 gap-px border-t border-[#eef1f4] sm:grid-cols-4">
          {[
            {
              label: 'Employee',
              value: formatAssetRequestEmployeeName(request.employee),
            },
            {
              label: 'Required By',
              value: request.requiredByDate ? formatProjectDate(request.requiredByDate) : '—',
            },
            {
              label: 'Submitted',
              value: request.submittedAt ? formatProjectDate(request.submittedAt) : '—',
            },
            {
              label: 'Created',
              value: formatProjectDate(request.createdAt),
            },
          ].map(({ label, value }) => (
            <div key={label} className="erp-users-stat px-5 py-4">
              <p className="erp-users-stat-label">{label}</p>
              <p className="erp-employee-meta-value">{value}</p>
            </div>
          ))}
        </div>

        {/* Body sections */}
        <div className="flex flex-col gap-0 divide-y divide-[#eef1f4]">
          <DetailSection title="Request Details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldRow label="Asset Category" value={request.assetCategory} />
              <FieldRow label="Asset Type" value={request.assetType} />
              <div className="sm:col-span-2">
                <FieldRow label="Reason" value={request.reason} />
              </div>
              {request.notes ? (
                <div className="sm:col-span-2">
                  <FieldRow label="Notes" value={request.notes} />
                </div>
              ) : null}
              {request.fulfilledByAsset ? (
                <div className="sm:col-span-2">
                  <FieldRow
                    label="Fulfilled By"
                    value={`${request.fulfilledByAsset.assetName} (${request.fulfilledByAsset.assetTag})`}
                  />
                </div>
              ) : null}
            </div>
          </DetailSection>

          {tiers.length > 0 || request.approvalRequest ? (
            <DetailSection title="Approval Chain">
              <ApprovalTierTimeline tiers={tiers} currentTier={request.approvalRequest?.currentTier ?? 1} />
            </DetailSection>
          ) : null}
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmSubmit}
        title="Submit Asset Request"
        description="This will send the request for approval. Are you sure?"
        confirmLabel="Submit"
        onConfirm={handleSubmit}
        onCancel={() => setConfirmSubmit(false)}
        confirmLoading={submitMutation.isPending}
      />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel Asset Request"
        description="Are you sure you want to cancel this request?"
        confirmLabel="Cancel Request"
        danger
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(false)}
        confirmLoading={cancelMutation.isPending}
      />
    </div>
  );
}
