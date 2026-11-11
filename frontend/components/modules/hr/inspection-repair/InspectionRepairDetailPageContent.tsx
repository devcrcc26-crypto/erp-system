'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Form,
  Grid,
  Radio,
  Skeleton,
  Tag,
} from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, StopOutlined } from '@ant-design/icons';
import { ArrowLeft, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { InspectionRepairStatus } from '@/lib/api/inspection-repair.types';
import {
  useCancelInspectionRepair,
  openInspectionRepairPdf,
  useInspectionRepair,
  useUpdateInspectionRepair,
} from '@/lib/query/inspection-repair';
import ExportPdfButton from '@/components/modules/hr/import-export/ExportPdfButton';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatInspectionRepairEmployeeName,
  formatInspectionRepairStatus,
  inspectionRepairStatusVariant,
} from '@/lib/utils/inspection-repair-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
type HrWorkflowStatus = Extract<
  InspectionRepairStatus,
  'IN_REPAIR' | 'REPAIRED' | 'REJECTED'
>;

const STATUS_TRANSITIONS: Partial<
  Record<InspectionRepairStatus, HrWorkflowStatus[]>
> = {
  SUBMITTED: ['IN_REPAIR', 'REJECTED'],
  IN_REPAIR: ['REPAIRED', 'REJECTED'],
};

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Inspection & repair detail - Users / employee profile chrome.
 */
export default function InspectionRepairDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useInspectionRepair(requestId);
  const cancelMutation = useCancelInspectionRepair(requestId);
  const updateMutation = useUpdateInspectionRepair(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<
    HrWorkflowStatus | undefined
  >();

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isOwner = request?.employeeId === currentUser.data?.id;
  const canCancel =
    Boolean(isOwner) &&
    ['DRAFT', 'SUBMITTED'].includes(request?.status ?? '');

  const nextStatuses = useMemo(
    () => (request ? (STATUS_TRANSITIONS[request.status] ?? []) : []),
    [request],
  );
  const canUpdateStatus = canViewHr && nextStatuses.length > 0;

  const statusOptions = useMemo(
    () =>
      nextStatuses.map((status) => ({
        value: status,
        label: formatInspectionRepairStatus(status, t),
        hint: t(`hr.inspectionRepairStatusHint.${status}`),
      })),
    [nextStatuses, t],
  );

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  function openStatusModal(): void {
    setPendingStatus(nextStatuses[0]);
    setStatusModalOpen(true);
  }

  function closeStatusModal(): void {
    setStatusModalOpen(false);
    setPendingStatus(undefined);
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.inspectionRepairCancelled'));
      router.push('/hr/inspection-repair');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.inspectionRepairCancelFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleStatusUpdate(): Promise<void> {
    if (!request || !pendingStatus) {
      return;
    }
    try {
      await updateMutation.mutateAsync({
        assetId: request.assetId ?? undefined,
        deviceName: request.assetId ? undefined : request.deviceName,
        location: request.location,
        make: request.make ?? undefined,
        model: request.model ?? undefined,
        year: request.year ?? undefined,
        description: request.description,
        solution: request.solution ?? undefined,
        urgency: request.urgency,
        inspectionType: request.inspectionType,
        status: pendingStatus,
      });
      messageApi.success(t('hr.messages.inspectionRepairUpdated'));
      closeStatusModal();
      await detailQuery.refetch();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.inspectionRepairUpdateFailed'),
        messageApi,
        t,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-inspection-repair-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.inspectionRepairNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/hr/inspection-repair')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const overflowMenuItems: MenuProps['items'] = [];
  if (request.approvalRequest?.id) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () =>
        router.push(`/approvals/${request.approvalRequest?.id}`),
    });
  }
  if (canUpdateStatus) {
    overflowMenuItems.push({
      key: 'status',
      label: t('hr.buttons.updateStatus'),
      onClick: openStatusModal,
    });
  }
  if (canCancel) {
    overflowMenuItems.push({
      key: 'cancel',
      label: t('hr.buttons.cancelRequest'),
      icon: <StopOutlined />,
      danger: true,
      onClick: () => setConfirmCancel(true),
    });
  }

  const showOverflowMenu = isNarrow && overflowMenuItems.length > 0;

  async function handleExportPdf(): Promise<void> {
    if (!request) return;
    await openInspectionRepairPdf(request.id);
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-inspection-repair-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/inspection-repair')}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <ExportPdfButton
              compact={isNarrow}
              buildPdf={() => handleExportPdf()}
            />
            {showOverflowMenu ? (
              <Dropdown
                menu={{ items: overflowMenuItems }}
                trigger={['click']}
              >
                <Button
                  icon={<MoreOutlined />}
                  aria-label={t('common.actions')}
                />
              </Dropdown>
            ) : (
              <>
                {request.approvalRequest?.id ? (
                  <Button
                    onClick={() =>
                      router.push(`/approvals/${request.approvalRequest?.id}`)
                    }
                  >
                    {isCompact
                      ? t('nav.approvals')
                      : t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
                {canUpdateStatus ? (
                  <Button type="primary" onClick={openStatusModal}>
                    {t('hr.buttons.updateStatus')}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => setConfirmCancel(true)}
                    aria-label={t('hr.buttons.cancelRequest')}
                  >
                    {isCompact ? undefined : t('hr.buttons.cancelRequest')}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">
                {request.requestNumber}
              </span>
              <StatusBadge
                label={formatInspectionRepairStatus(request.status, t)}
                variant={inspectionRepairStatusVariant(request.status)}
              />
              {request.assetId ? (
                <Tag color="blue">{t('hr.form.asset')}</Tag>
              ) : (
                <Tag>{t('hr.form.deviceName')}</Tag>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {request.deviceName}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {formatInspectionRepairEmployeeName(request.employee)}
              {request.submittedAt
                ? ` · ${formatProjectDate(request.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.form.inspectionType')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {t(`hr.inspectionType.${request.inspectionType}`)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.form.urgency')}</p>
            <p className="erp-employee-meta-value">
              {t(`hr.urgency.${request.urgency}`)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.form.location')}</p>
            <p className="erp-employee-meta-value truncate">
              {request.location}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.labels.completedAt')}
            </p>
            <p className="erp-employee-meta-value">
              {request.completedAt
                ? formatProjectDate(request.completedAt)
                : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {request.asset ? (
                  <MetaItem label={t('hr.form.asset')}>
                    <div className="flex items-start gap-2">
                      <Wrench
                        size={16}
                        className="mt-0.5 shrink-0 text-[#6B7280]"
                        strokeWidth={1.75}
                      />
                      <span>
                        {request.asset.serialNumber} - {request.asset.brand}{' '}
                        {request.asset.model}
                      </span>
                    </div>
                  </MetaItem>
                ) : null}
                <MetaItem label={t('hr.form.deviceName')}>
                  {request.deviceName}
                </MetaItem>
                <MetaItem label={t('hr.form.make')}>
                  {request.make ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.model')}>
                  {request.model ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.year')}>
                  {request.year?.toString() ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.location')}>
                  {request.location}
                </MetaItem>
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.form.description')}>
                    <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                      {request.description}
                    </p>
                  </MetaItem>
                </div>
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.form.solution')}>
                    <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                      {request.solution ?? '-'}
                    </p>
                  </MetaItem>
                </div>
              </div>
            </DetailSection>

            {canViewHr ? (
              <DetailSection
                title={t('hr.section.updateStatus')}
                action={
                  canUpdateStatus ? (
                    <Button type="primary" onClick={openStatusModal}>
                      {t('hr.buttons.updateStatus')}
                    </Button>
                  ) : undefined
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-[#e8ebef] bg-[#fafbfc] px-3 py-3">
                    <p className="erp-users-stat-label mb-1">
                      {t('hr.assetDialog.statusCurrentLabel')}
                    </p>
                    <StatusBadge
                      label={formatInspectionRepairStatus(request.status, t)}
                      variant={inspectionRepairStatusVariant(request.status)}
                    />
                  </div>

                  {canUpdateStatus ? (
                    <>
                      <p className="erp-users-cell-sub m-0">
                        {t('hr.messages.inspectionRepairStatusActionsHint')}
                      </p>
                      <div className="flex flex-col gap-2">
                        {statusOptions.map((option) => (
                          <div
                            key={option.value}
                            className="flex items-start gap-3 rounded-xl border border-[#e8ebef] px-3 py-3"
                          >
                            <StatusBadge
                              label={option.label}
                              variant={inspectionRepairStatusVariant(
                                option.value,
                              )}
                            />
                            <p className="erp-users-cell-sub m-0 flex-1 leading-snug">
                              {option.hint}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <ErpNotice
                      tone="info"
                      title={t('hr.messages.inspectionRepairStatusLocked')}
                    />
                  )}
                </div>
              </DetailSection>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4">
          {tiers.length > 0 ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={request.approvalRequest?.currentTier ?? 1}
            />
          ) : (
            <div className="erp-pro-card overflow-hidden">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={statusModalOpen}
        title={t('hr.dialog.updateInspectionRepairStatusTitle')}
        description={`${t('hr.dialog.updateInspectionRepairStatusDesc')} (${request.requestNumber} · ${request.deviceName})`}
        confirmLabel={t('hr.buttons.updateStatus')}
        cancelLabel={t('hr.buttons.cancel')}
        confirmLoading={updateMutation.isPending}
        confirmDisabled={!pendingStatus || pendingStatus === request.status}
        onConfirm={() => void handleStatusUpdate()}
        onCancel={closeStatusModal}
      >
        <div className="mt-3 flex flex-col gap-4">
          <div className="rounded-xl border border-[#e8ebef] bg-[#fafbfc] px-3 py-3">
            <p className="erp-users-stat-label mb-1">
              {t('hr.assetDialog.statusCurrentLabel')}
            </p>
            <StatusBadge
              label={formatInspectionRepairStatus(request.status, t)}
              variant={inspectionRepairStatusVariant(request.status)}
            />
          </div>

          <Form layout="vertical" requiredMark={false}>
            <Form.Item
              label={t('hr.assetDialog.statusSelectLabel')}
              className="mb-0"
            >
              <Radio.Group
                value={pendingStatus}
                onChange={(event) =>
                  setPendingStatus(event.target.value as HrWorkflowStatus)
                }
                disabled={updateMutation.isPending}
                className="w-full"
              >
                <div className="flex w-full flex-col gap-2">
                  {statusOptions.map((option) => {
                    const selected = pendingStatus === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`erp-vehicle-pick-card m-0 flex w-full cursor-pointer items-center gap-3 p-3${
                          selected ? ' erp-vehicle-pick-card--selected' : ''
                        }`}
                      >
                        <Radio value={option.value} className="m-0" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1">
                            <StatusBadge
                              label={option.label}
                              variant={inspectionRepairStatusVariant(
                                option.value,
                              )}
                            />
                          </div>
                          <p className="erp-users-cell-sub m-0 leading-snug">
                            {option.hint}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Radio.Group>
            </Form.Item>
          </Form>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={confirmCancel}
        title={t('hr.empty.cancelInspectionRepairTitle')}
        description={t('hr.empty.cancelInspectionRepairDescription')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        cancelLabel={t('hr.buttons.cancel')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
