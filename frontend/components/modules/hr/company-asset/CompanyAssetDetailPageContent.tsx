'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Form,
  Grid,
  Input,
  Progress,
  Radio,
  Skeleton,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { ArrowLeft, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import ExportPdfButton from '@/components/modules/hr/import-export/ExportPdfButton';
import CompanyAssetPhoto from '@/components/modules/hr/company-asset/CompanyAssetPhoto';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type {
  AssetStatus,
  CompanyAssetAssignmentListItem,
} from '@/lib/api/company-asset.types';
import {
  openCompanyAssetPdf,
  useAcknowledgeAssetReturn,
  useCompanyAsset,
  useCompanyAssetAssignments,
  useIssueCompanyAssetAssignment,
  useReturnCompanyAssetAssignment,
  useDeleteCompanyAsset,
  useUpdateCompanyAssetStatus,
} from '@/lib/query/company-asset';
import {
  ASSET_MANUAL_STATUS_OPTIONS,
  assetStatusVariant,
  canChangeAssetStatusManually,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import {
  getDepreciationProgressColor,
  resolveAssetDepreciation,
} from '@/lib/utils/asset-depreciation-display';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { formatUserName } from '@/lib/utils/user-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';

function displayEmployeeName(
  user?: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    chineseName?: string | null;
    email?: string | null;
  } | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}
interface IssueAssetFormValues {
  employeeId?: string;
  notes?: string;
}

interface ReturnAssetFormValues {
  returnedTo?: string;
  returnedNotes?: string;
  returnReason?: string;
  handoverNotes?: string;
}

interface AcknowledgeReturnFormValues {
  returnedTo?: string;
  returnedNotes?: string;
}

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
 * Company asset detail - Users / employee profile chrome.
 */
export default function CompanyAssetDetailPageContent({
  assetId,
}: {
  assetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const detailQuery = useCompanyAsset(assetId);
  const statusMutation = useUpdateCompanyAssetStatus(assetId);
  const deleteMutation = useDeleteCompanyAsset();

  useSetHeaderExtra(null);

  const assignmentsQuery = useCompanyAssetAssignments(assetId, {
    page: 1,
    limit: 20,
    includeReturned: true,
  });

  const issueMutation = useIssueCompanyAssetAssignment(assetId);
  const activeAssignmentId =
    assignmentsQuery.data?.data?.find((assignment) => !assignment.returnedAt)
      ?.id ?? '';
  const returnMutation = useReturnCompanyAssetAssignment(
    assetId,
    activeAssignmentId,
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AssetStatus | undefined>();

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueForm] = Form.useForm<IssueAssetFormValues>();
  const issueEmployeeId = Form.useWatch('employeeId', issueForm);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnForm] = Form.useForm<ReturnAssetFormValues>();
  const [acknowledgeModalOpen, setAcknowledgeModalOpen] = useState(false);
  const [acknowledgeForm] = Form.useForm<AcknowledgeReturnFormValues>();
  const acknowledgeMutation = useAcknowledgeAssetReturn(assetId, activeAssignmentId);

  const asset = detailQuery.data;
  const depreciation = asset ? resolveAssetDepreciation(asset) : null;
  const assignmentHistory = assignmentsQuery.data?.data ?? [];
  const activeAssignment = assignmentHistory.find(
    (assignment) => !assignment.returnedAt,
  );
  const pastAssignments = assignmentHistory.filter((assignment) =>
    Boolean(assignment.returnedAt),
  );
  const canChangeStatus = asset
    ? canChangeAssetStatusManually(asset.status)
    : false;
  const isReturnPending = Boolean(activeAssignment?.returnInitiatedAt && !activeAssignment?.returnedAt);
  const canIssue = asset?.status === 'AVAILABLE' && !activeAssignment;
  const canReturn = Boolean(activeAssignment) && !isReturnPending;
  const manualStatusOptions = useMemo(
    () =>
      ASSET_MANUAL_STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: formatAssetStatus(option.value, t),
      })),
    [t],
  );

  function renderAssignmentFields(
    assignment: CompanyAssetAssignmentListItem,
    options?: { includeReturnFields?: boolean },
  ): React.ReactNode {
    const includeReturnFields =
      options?.includeReturnFields ?? Boolean(assignment.returnedAt);

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetaItem label={t('hr.assetLabels.assignedTo')}>
          <div>
            <p className="erp-users-cell-strong m-0">
              {displayEmployeeName(assignment.employee)}
            </p>
            {assignment.employee.email ? (
              <p className="erp-users-email m-0 mt-0.5">
                {assignment.employee.email}
              </p>
            ) : null}
          </div>
        </MetaItem>
        <MetaItem label={t('hr.assetLabels.assignedAt')}>
          {formatProjectDate(assignment.assignedAt)}
        </MetaItem>
        <MetaItem label={t('hr.assetLabels.issuedBy')}>
          {displayEmployeeName(assignment.issuedBy)}
        </MetaItem>
        {assignment.notes ? (
          <div className="md:col-span-2">
            <MetaItem label={t('hr.assetLabels.notes')}>
              <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                {assignment.notes}
              </p>
            </MetaItem>
          </div>
        ) : null}
        {includeReturnFields ? (
          <>
            <MetaItem label={t('hr.assetLabels.returnedAt')}>
              {formatProjectDate(assignment.returnedAt ?? null)}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.returnedBy')}>
              {displayEmployeeName(assignment.returnedBy)}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.returnedTo')}>
              {assignment.returnedTo?.trim() || '-'}
            </MetaItem>
            {assignment.returnedNotes ? (
              <div className="md:col-span-2">
                <MetaItem label={t('hr.assetLabels.returnedNotes')}>
                  <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                    {assignment.returnedNotes}
                  </p>
                </MetaItem>
              </div>
            ) : null}
            {assignment.returnReason ? (
              <div className="md:col-span-2">
                <MetaItem label="Return Reason">
                  <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                    {assignment.returnReason}
                  </p>
                </MetaItem>
              </div>
            ) : null}
            {assignment.handoverNotes ? (
              <div className="md:col-span-2">
                <MetaItem label="Handover Notes">
                  <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                    {assignment.handoverNotes}
                  </p>
                </MetaItem>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  function closeIssueModal(): void {
    issueForm.resetFields();
    setIssueModalOpen(false);
  }

  async function handleIssueSubmit(): Promise<void> {
    let values: IssueAssetFormValues;
    try {
      values = await issueForm.validateFields();
    } catch {
      return;
    }

    if (!values.employeeId) {
      return;
    }

    try {
      await issueMutation.mutateAsync({
        employeeId: values.employeeId,
        notes: values.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.assetMessages.assignmentIssued'));
      await assignmentsQuery.refetch();
      await detailQuery.refetch();
      closeIssueModal();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToIssueAssignment'),
        messageApi,
        t,
      );
    }
  }

  function closeReturnModal(): void {
    returnForm.resetFields();
    setReturnModalOpen(false);
  }

  async function handleReturnSubmit(): Promise<void> {
    if (!activeAssignment) return;

    let values: ReturnAssetFormValues;
    try {
      values = await returnForm.validateFields();
    } catch {
      return;
    }

    try {
      await returnMutation.mutateAsync({
        returnedTo: values.returnedTo?.trim() || undefined,
        returnedNotes: values.returnedNotes?.trim() || undefined,
        returnReason: values.returnReason?.trim() || undefined,
        handoverNotes: values.handoverNotes?.trim() || undefined,
      });
      messageApi.success(t('hr.assetMessages.assignmentReturned'));
      await assignmentsQuery.refetch();
      await detailQuery.refetch();
      closeReturnModal();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToReturnAssignment'),
        messageApi,
        t,
      );
    }
  }

  async function handleStatusChange(): Promise<void> {
    if (!pendingStatus || pendingStatus === 'IN_USE') {
      return;
    }
    if (pendingStatus === asset?.status) {
      setStatusModalOpen(false);
      return;
    }
    try {
      await statusMutation.mutateAsync({ status: pendingStatus });
      messageApi.success(t('hr.assetMessages.statusUpdated'));
      setStatusModalOpen(false);
      setPendingStatus(undefined);
      await detailQuery.refetch();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToUpdateStatus'),
        messageApi,
        t,
      );
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(assetId);
      messageApi.success(t('hr.assetMessages.deleted'));
      router.push('/hr/company-asset');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToDelete'),
        messageApi,
        t,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-company-asset-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !asset) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.assetMessages.notFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/hr/company-asset')}>
              {t('hr.assetButtons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const overflowMenuItems: MenuProps['items'] = [];
  if (canChangeStatus) {
    overflowMenuItems.push({
      key: 'status',
      label: t('hr.assetButtons.changeStatus'),
      onClick: () => {
        setPendingStatus(asset.status);
        setStatusModalOpen(true);
      },
    });
  }
  overflowMenuItems.push({
    key: 'edit',
    label: t('hr.assetButtons.editAsset'),
    icon: <EditOutlined />,
    onClick: () => router.push(`/hr/company-asset/${assetId}/edit`),
  });
  if (isReturnPending) {
    overflowMenuItems.push({
      key: 'acknowledge-return',
      label: 'Acknowledge Return',
      onClick: () => setAcknowledgeModalOpen(true),
    });
  } else if (canReturn) {
    overflowMenuItems.push({
      key: 'return',
      label: t('hr.assetButtons.returnAsset'),
      onClick: () => setReturnModalOpen(true),
    });
  }
  overflowMenuItems.push({
    key: 'delete',
    label: t('hr.assetButtons.deleteAsset'),
    icon: <DeleteOutlined />,
    danger: true,
    onClick: () => setConfirmDelete(true),
  });

  const showOverflowMenu = isNarrow;

  async function handleExportPdf(): Promise<void> {
    if (!asset) return;
    await openCompanyAssetPdf(asset.id);
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-company-asset-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/company-asset')}
              aria-label={t('hr.assetButtons.back')}
            >
              {isNarrow ? undefined : t('hr.assetButtons.back')}
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
                {canChangeStatus ? (
                  <Button
                    onClick={() => {
                      setPendingStatus(asset.status);
                      setStatusModalOpen(true);
                    }}
                  >
                    {isCompact
                      ? t('hr.assetLabels.status')
                      : t('hr.assetButtons.changeStatus')}
                  </Button>
                ) : null}
                {isReturnPending ? (
                  <Button type="primary" onClick={() => setAcknowledgeModalOpen(true)}>
                    Acknowledge Return
                  </Button>
                ) : canReturn ? (
                  <Button type="primary" onClick={() => setReturnModalOpen(true)}>
                    {t('hr.assetButtons.returnAsset')}
                  </Button>
                ) : null}
                <Button
                  icon={<EditOutlined />}
                  onClick={() =>
                    router.push(`/hr/company-asset/${assetId}/edit`)
                  }
                  aria-label={t('hr.assetButtons.editAsset')}
                >
                  {isCompact ? undefined : t('hr.assetButtons.editAsset')}
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('hr.assetButtons.deleteAsset')}
                >
                  {isCompact ? undefined : t('hr.assetButtons.deleteAsset')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <CompanyAssetPhoto
            assetId={asset.id}
            photoDocumentId={asset.photoDocumentId}
            label={asset.serialNumber}
            canEdit
            variant="hero"
            size={isCompact ? 72 : 88}
          />
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{asset.serialNumber}</span>
              <StatusBadge
                label={formatAssetStatus(asset.status, t)}
                variant={assetStatusVariant(asset.status)}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {asset.brand} {asset.model}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {asset.type} · {asset.year} · {asset.color}
              {activeAssignment
                ? ` · ${displayEmployeeName(activeAssignment.employee)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.assetLabels.type')}</p>
            <p className="erp-employee-meta-value truncate">{asset.type}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.assetLabels.year')}</p>
            <p className="erp-employee-meta-value">{asset.year}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.assetLabels.color')}</p>
            <p className="erp-employee-meta-value truncate">{asset.color}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.assetLabels.assignedTo')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {activeAssignment
                ? displayEmployeeName(activeAssignment.employee)
                : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-pro-card min-w-0 overflow-hidden">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <DetailSection
            title={t('hr.assetSection.currentAssignment')}
            action={
              isReturnPending ? (
                <Button type="primary" onClick={() => setAcknowledgeModalOpen(true)}>
                  Acknowledge Return
                </Button>
              ) : activeAssignment ? (
                <Button type="primary" onClick={() => setReturnModalOpen(true)}>
                  {t('hr.assetButtons.returnAsset')}
                </Button>
              ) : canIssue ? (
                <Button type="primary" onClick={() => setIssueModalOpen(true)}>
                  {t('hr.assetButtons.issueAsset')}
                </Button>
              ) : undefined
            }
          >
            {activeAssignment ? (
              <div className="flex flex-col gap-4">
                <StatusBadge
                  label={isReturnPending ? 'Return Pending' : t('hr.assetStatus.IN_USE')}
                  variant={isReturnPending ? 'warning' : assetStatusVariant('IN_USE')}
                />
                {isReturnPending ? (
                  <ErpNotice
                    tone="warning"
                    title="Return initiated — awaiting HR acknowledgement"
                    description={activeAssignment.returnReason ?? undefined}
                  />
                ) : null}
                {renderAssignmentFields(activeAssignment, {
                  includeReturnFields: false,
                })}
              </div>
            ) : (
              <ErpNotice
                tone="info"
                title={t('hr.assetMessages.noActiveAssignment')}
                description={
                  asset.status === 'AVAILABLE'
                    ? t('hr.assetMessages.issueWhenAvailable')
                    : t('hr.assetMessages.cannotIssueWhileUnavailable')
                }
              />
            )}
          </DetailSection>

          <DetailSection title={t('hr.assetSection.assetDetails')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.assetLabels.serialNumber')}>
                <div className="flex items-start gap-2">
                  <Package
                    size={16}
                    className="mt-0.5 shrink-0 text-[#6B7280]"
                    strokeWidth={1.75}
                  />
                  <span>{asset.serialNumber}</span>
                </div>
              </MetaItem>
              <MetaItem label={t('hr.assetLabels.status')}>
                <StatusBadge
                  label={formatAssetStatus(asset.status, t)}
                  variant={assetStatusVariant(asset.status)}
                />
              </MetaItem>
              <MetaItem label={t('hr.assetLabels.type')}>{asset.type}</MetaItem>
              <MetaItem label={t('hr.assetLabels.brand')}>{asset.brand}</MetaItem>
              <MetaItem label={t('hr.assetLabels.model')}>{asset.model}</MetaItem>
              <MetaItem label={t('hr.assetLabels.year')}>{asset.year}</MetaItem>
              <MetaItem label={t('hr.assetLabels.color')}>{asset.color}</MetaItem>
              <MetaItem label={t('hr.assetLabels.createdAt')}>
                {formatProjectDate(asset.createdAt)}
              </MetaItem>
              <MetaItem label={t('hr.assetLabels.updatedAt')}>
                {formatProjectDate(asset.updatedAt)}
              </MetaItem>
              {asset.description ? (
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.assetLabels.description')}>
                    <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                      {asset.description}
                    </p>
                  </MetaItem>
                </div>
              ) : null}
              {asset.assetCode ? (
                <MetaItem label={t('hr.assetLabels.assetCode')}>
                  {asset.assetCode}
                </MetaItem>
              ) : null}
              {asset.cardNumber ? (
                <MetaItem label={t('hr.assetLabels.cardNumber')}>
                  {asset.cardNumber}
                </MetaItem>
              ) : null}
              {asset.assetName ? (
                <MetaItem label={t('hr.assetLabels.assetName')}>
                  {asset.assetName}
                </MetaItem>
              ) : null}
              {asset.specifications ? (
                <MetaItem label={t('hr.assetLabels.specifications')}>
                  {asset.specifications}
                </MetaItem>
              ) : null}
              {asset.assetCategory ? (
                <MetaItem label={t('hr.assetLabels.assetCategory')}>
                  {asset.assetCategory}
                </MetaItem>
              ) : null}
              {asset.startUseDate ? (
                <MetaItem label={t('hr.assetLabels.startUseDate')}>
                  {formatProjectDate(asset.startUseDate)}
                </MetaItem>
              ) : null}
              {asset.usefulLifeMonths != null ? (
                <MetaItem label={t('hr.assetLabels.usefulLifeMonths')}>
                  {asset.usefulLifeMonths}
                </MetaItem>
              ) : null}
              {asset.originalValue != null ? (
                <MetaItem label={t('hr.assetLabels.originalValue')}>
                  {formatEtbAmount(asset.originalValue)}
                </MetaItem>
              ) : null}
              {asset.managingDepartment ? (
                <MetaItem label={t('hr.assetLabels.managingDepartment')}>
                  {asset.managingDepartment}
                </MetaItem>
              ) : null}
              {asset.storageLocation ? (
                <MetaItem label={t('hr.assetLabels.storageLocation')}>
                  {asset.storageLocation}
                </MetaItem>
              ) : null}
            </div>
          </DetailSection>

          {depreciation &&
          asset.originalValue != null &&
          asset.usefulLifeMonths ? (
            <DetailSection title={t('hr.assetSection.depreciationSummary')}>
              <DepreciationSummaryCard
                depreciation={depreciation}
                originalValue={asset.originalValue}
                usefulLifeMonths={asset.usefulLifeMonths}
                t={t}
              />
            </DetailSection>
          ) : null}

          <DetailSection title={t('hr.assetSection.assignmentHistory')}>
            {pastAssignments.length > 0 ? (
              <div className="flex flex-col gap-3">
                {pastAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-xl border border-[#e8ebef] bg-[#fafbfc] px-3 py-4 sm:px-4"
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="erp-users-cell-strong">
                        {displayEmployeeName(assignment.employee)}
                      </span>
                      <StatusBadge
                        label={t('hr.assetStatus.AVAILABLE')}
                        variant={assetStatusVariant('AVAILABLE')}
                      />
                    </div>
                    {renderAssignmentFields(assignment, {
                      includeReturnFields: true,
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <p className="erp-users-cell-sub m-0">
                {t('hr.assetEmpty.noAssignmentHistory')}
              </p>
            )}
          </DetailSection>
        </div>
      </div>

      <ConfirmDialog
        open={statusModalOpen}
        className="erp-hr-travel-modal"
        title={t('hr.assetDialog.statusTitle')}
        description={
          asset
            ? `${t('hr.assetDialog.statusDesc')} (${asset.serialNumber} · ${asset.brand} ${asset.model})`
            : t('hr.assetDialog.statusDesc')
        }
        confirmLabel={t('hr.assetButtons.save')}
        cancelLabel={t('hr.assetButtons.cancel')}
        confirmLoading={statusMutation.isPending}
        confirmDisabled={
          !pendingStatus ||
          pendingStatus === 'IN_USE' ||
          pendingStatus === asset.status
        }
        onConfirm={() => void handleStatusChange()}
        onCancel={() => {
          setStatusModalOpen(false);
          setPendingStatus(undefined);
        }}
      >
        <div className="mt-3 flex flex-col gap-4">
          <div className="rounded-xl border border-[#e8ebef] bg-[#fafbfc] px-3 py-3">
            <p className="erp-users-stat-label mb-1">
              {t('hr.assetDialog.statusCurrentLabel')}
            </p>
            <StatusBadge
              label={formatAssetStatus(asset.status, t)}
              variant={assetStatusVariant(asset.status)}
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
                  setPendingStatus(event.target.value as AssetStatus)
                }
                disabled={statusMutation.isPending}
                className="w-full"
              >
                <div className="flex w-full flex-col gap-2">
                  {manualStatusOptions.map((option) => {
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
                              variant={assetStatusVariant(option.value)}
                            />
                          </div>
                          <p className="erp-users-cell-sub m-0 leading-snug">
                            {t(
                              `hr.assetDialog.statusOptionHint.${option.value}`,
                            )}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Radio.Group>
            </Form.Item>
          </Form>

          <p className="erp-users-cell-sub m-0 leading-relaxed">
            {t('hr.assetDialog.statusInUseHint')}
          </p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        className="erp-hr-travel-modal"
        title={t('hr.assetDialog.deleteTitle')}
        description={t('hr.assetDialog.deleteDesc')}
        confirmLabel={t('hr.assetButtons.deleteAsset')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={issueModalOpen}
        className="erp-hr-travel-modal"
        title={t('hr.assetDialog.issueTitle')}
        description={
          asset
            ? `${t('hr.assetDialog.issueDesc')} (${asset.serialNumber} · ${asset.brand} ${asset.model})`
            : t('hr.assetDialog.issueDesc')
        }
        confirmLabel={t('hr.assetButtons.issueAsset')}
        cancelLabel={t('hr.assetButtons.cancel')}
        confirmLoading={issueMutation.isPending}
        confirmDisabled={!issueEmployeeId}
        onConfirm={() => void handleIssueSubmit()}
        onCancel={closeIssueModal}
      >
        <Form
          form={issueForm}
          layout="vertical"
          requiredMark={false}
          className="mt-3"
          disabled={issueMutation.isPending}
        >
          <Form.Item
            name="employeeId"
            label={t('hr.assetLabels.employee')}
            rules={[
              {
                required: true,
                message: t('hr.assetValidation.employeeRequired'),
              },
            ]}
          >
            <UserSelect
              allowClear={false}
              placeholder={t('hr.assetPlaceholder.selectEmployee')}
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="notes" label={t('hr.assetLabels.notes')}>
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder={t('hr.assetPlaceholder.issueNotes')}
            />
          </Form.Item>
        </Form>
      </ConfirmDialog>

      <ConfirmDialog
        open={returnModalOpen}
        className="erp-hr-travel-modal"
        title={t('hr.assetDialog.returnTitle')}
        description={
          asset
            ? `${t('hr.assetDialog.returnDesc')} (${asset.serialNumber} · ${asset.brand} ${asset.model})`
            : t('hr.assetDialog.returnDesc')
        }
        confirmLabel={t('hr.assetButtons.returnAsset')}
        cancelLabel={t('hr.assetButtons.cancel')}
        confirmLoading={returnMutation.isPending}
        confirmDisabled={!activeAssignment}
        onConfirm={() => void handleReturnSubmit()}
        onCancel={closeReturnModal}
      >
        <div className="mt-3 flex flex-col gap-4">
          {activeAssignment ? (
            <div className="rounded-xl border border-[#e8ebef] bg-[#fafbfc] px-3 py-3">
              <p className="erp-users-stat-label mb-1">
                {t('hr.assetLabels.assignedTo')}
              </p>
              <p className="erp-users-cell-strong m-0">
                {displayEmployeeName(activeAssignment.employee)}
              </p>
              {activeAssignment.employee.email ? (
                <p className="erp-users-email m-0 mt-0.5">
                  {activeAssignment.employee.email}
                </p>
              ) : null}
              <p className="erp-users-cell-sub m-0 mt-2">
                {t('hr.assetLabels.assignedAt')}:{' '}
                {formatProjectDate(activeAssignment.assignedAt)}
              </p>
            </div>
          ) : null}

          <Form
            form={returnForm}
            layout="vertical"
            requiredMark={false}
            disabled={returnMutation.isPending}
          >
            <Form.Item name="returnedTo" label={t('hr.assetLabels.returnedTo')}>
              <Input
                maxLength={200}
                placeholder={t('hr.assetPlaceholder.returnedTo')}
              />
            </Form.Item>
            <Form.Item name="returnReason" label="Return Reason">
              <Input.TextArea
                rows={2}
                maxLength={2000}
                showCount
                placeholder="Why is this asset being returned?"
              />
            </Form.Item>
            <Form.Item name="handoverNotes" label="Handover Notes (credentials, access codes, etc.)">
              <Input.TextArea
                rows={3}
                maxLength={4000}
                showCount
                placeholder="Document any credentials, access codes, or special instructions"
              />
            </Form.Item>
            <Form.Item
              name="returnedNotes"
              label={t('hr.assetLabels.returnedNotes')}
              className="mb-0"
            >
              <Input.TextArea
                rows={2}
                maxLength={2000}
                showCount
                placeholder={t('hr.assetPlaceholder.returnNotes')}
              />
            </Form.Item>
          </Form>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={acknowledgeModalOpen}
        className="erp-hr-travel-modal"
        title="Acknowledge Asset Return"
        description="Confirm that you have received this asset back."
        confirmLabel="Acknowledge Return"
        onConfirm={async () => {
          if (!activeAssignment) return;
          let values: AcknowledgeReturnFormValues;
          try {
            values = await acknowledgeForm.validateFields();
          } catch {
            return;
          }
          try {
            await acknowledgeMutation.mutateAsync({
              returnedTo: values.returnedTo?.trim() || undefined,
              returnedNotes: values.returnedNotes?.trim() || undefined,
            });
            messageApi.success('Asset return acknowledged');
            acknowledgeForm.resetFields();
            setAcknowledgeModalOpen(false);
            await assignmentsQuery.refetch();
            await detailQuery.refetch();
          } catch (error: unknown) {
            notifyApiError(error, 'Failed to acknowledge return', messageApi, t);
          }
        }}
        onCancel={() => { acknowledgeForm.resetFields(); setAcknowledgeModalOpen(false); }}
        confirmLoading={acknowledgeMutation.isPending}
      >
        <div className="pt-3">
          <Form form={acknowledgeForm} layout="vertical" requiredMark={false} disabled={acknowledgeMutation.isPending}>
            <Form.Item name="returnedTo" label={t('hr.assetLabels.returnedTo')}>
              <Input maxLength={200} placeholder={t('hr.assetPlaceholder.returnedTo')} />
            </Form.Item>
            <Form.Item name="returnedNotes" label={t('hr.assetLabels.returnedNotes')} className="mb-0">
              <Input.TextArea rows={2} maxLength={2000} showCount placeholder={t('hr.assetPlaceholder.returnNotes')} />
            </Form.Item>
          </Form>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function DepreciationSummaryCard({
  depreciation,
  originalValue,
  usefulLifeMonths,
  t,
}: {
  depreciation: ReturnType<typeof resolveAssetDepreciation>;
  originalValue: number | string;
  usefulLifeMonths: number;
  t: (key: string) => string;
}): React.ReactNode {
  const percent = depreciation.depreciationPercent ?? 0;
  const progressColor = getDepreciationProgressColor(percent);
  const fullyDepreciated = percent >= 100;

  const rows = [
    {
      label: t('hr.assetLabels.originalValue'),
      value: formatEtbAmount(originalValue),
    },
    {
      label: t('hr.assetLabels.monthlyDepreciation'),
      value:
        depreciation.monthlyDepreciation != null
          ? formatEtbAmount(depreciation.monthlyDepreciation)
          : '-',
    },
    {
      label: t('hr.assetLabels.monthsDepreciated'),
      value: `${depreciation.monthsDepreciated} / ${usefulLifeMonths} ${t('hr.assetLabels.monthsSuffix')}`,
    },
    {
      label: t('hr.assetLabels.accumulatedDepreciation'),
      value:
        depreciation.accumulatedDepreciation != null
          ? formatEtbAmount(depreciation.accumulatedDepreciation)
          : '-',
    },
    {
      label: t('hr.assetLabels.netValue'),
      value:
        depreciation.netValue != null
          ? formatEtbAmount(depreciation.netValue)
          : '-',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <p
              className="mb-0.5 text-xs font-medium uppercase tracking-wide"
              style={{ color: tokens.colorTextTertiary }}
            >
              {row.label}
            </p>
            <p
              className="m-0 text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {row.value}
            </p>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: tokens.colorTextTertiary }}
          >
            {t('hr.assetLabels.status')}
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: fullyDepreciated ? '#8c8c8c' : progressColor }}
          >
            {fullyDepreciated
              ? t('hr.assetLabels.fullyDepreciated')
              : `${Math.round(percent)}%`}
          </span>
        </div>
        <Progress
          percent={Math.round(percent)}
          strokeColor={progressColor}
          showInfo={false}
          size="small"
        />
      </div>
    </div>
  );
}
