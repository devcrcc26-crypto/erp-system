'use client';

import './approvals-v2.css';

import { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Grid, Input, InputNumber, Skeleton, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DownOutlined,
  EditOutlined,
  RollbackOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalDetailSidebar from '@/components/modules/approvals/ApprovalDetailSidebar';
import GenericApprovalDetail from '@/components/modules/approvals/detail/GenericApprovalDetail';
import BusinessTripDetail from '@/components/modules/approvals/detail/BusinessTripDetail';
import ExpenseClaimDetail from '@/components/modules/approvals/detail/ExpenseClaimDetail';
import FlightApplicationDetail from '@/components/modules/approvals/detail/FlightApplicationDetail';
import LeaveRequestDetail from '@/components/modules/approvals/detail/LeaveRequestDetail';
import {
  OvertimeApprovalEditDiff,
  OvertimeEditedBadge,
} from '@/components/modules/approvals/detail/OvertimeApprovalEditChrome';
import OvertimeRequestDetail from '@/components/modules/approvals/detail/OvertimeRequestDetail';
import PerDiemDetail from '@/components/modules/approvals/detail/PerDiemDetail';
import PerDiemSettlementDetail from '@/components/modules/approvals/detail/PerDiemSettlementDetail';
import PurchaseRequestDetail from '@/components/modules/approvals/detail/PurchaseRequestDetail';
import MaterialRequisitionDetail from '@/components/modules/approvals/detail/MaterialRequisitionDetail';
import ConsumablesRequisitionDetail from '@/components/modules/approvals/detail/ConsumablesRequisitionDetail';
import VehicleApplicationDetail from '@/components/modules/approvals/detail/VehicleApplicationDetail';
import VehicleRefuelingDetail from '@/components/modules/approvals/detail/VehicleRefuelingDetail';
import OfficialSealDetail from '@/components/modules/approvals/detail/OfficialSealDetail';
import ProjectSealDetail from '@/components/modules/approvals/detail/ProjectSealDetail';
import InspectionRepairDetail from '@/components/modules/approvals/detail/InspectionRepairDetail';
import ExitPermitDetail from '@/components/modules/approvals/detail/ExitPermitDetail';
import FieldMovementDetail from '@/components/modules/approvals/detail/FieldMovementDetail';
import WorkFromHomeDetail from '@/components/modules/approvals/detail/WorkFromHomeDetail';
import ConditionResponsePanel from '@/components/modules/approvals/ConditionResponsePanel';
import RejectedBanner from '@/components/modules/approvals/RejectedBanner';
import ResubmitRequestDialog from '@/components/modules/approvals/ResubmitPanel';
import ApprovalEventHistory from '@/components/modules/approvals/ApprovalEventHistory';
import LateSubmissionBanner from '@/components/modules/approvals/LateSubmissionBanner';
import ReturnedBanner from '@/components/modules/approvals/ReturnedBanner';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type {
  ApprovalRequestDetail,
  ApprovalTier,
} from '@/lib/api/approvals.types';
import {
  useAddApprovalCondition,
  useApprovalRequest,
  useApproveApprovalTier,
  useRejectApprovalTier,
  useResolveApprovalCondition,
  useReturnApprovalTier,
} from '@/lib/query/approvals';
import { usePerDiemRequest, useSetApprovedPerDiemRate } from '@/lib/query/per-diem';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { useCurrentUser } from '@/lib/query/profile';
import {
  findCurrentTier,
  formatApprovalUserName,
  formatSubmittedFor,
  parseTierConditions,
  resolveDisplayStatus,
} from '@/lib/utils/approval-display';
import { formatApprovalCategoryName } from '@/lib/utils/approval-category-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  canEditOwnRequest,
  canResubmitOwnRequest,
  editRequestHref,
} from '@/lib/utils/request-edit';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';

type ActionModalKind =
  | 'approve'
  | 'approveOnBehalf'
  | 'returnOnBehalf'
  | 'conditional'
  | 'return'
  | 'reject'
  | null;

const DETAIL_ROOT = `erp-pro-list-page erp-users-page erp-employee-detail-page erp-approvals-detail-page erp-approvals-v2 ${DETAIL_PAGE_V2}`;

function resolveCategoryCode(request: ApprovalRequestDetail): string {
  return (request.categoryCode ?? request.category?.code ?? '').trim();
}

function renderTypedDetail(request: ApprovalRequestDetail): React.ReactNode {
  const code = resolveCategoryCode(request);
  const sourceId = request.sourceId ?? null;

  switch (code) {
    case 'LEAVE_REQUEST':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <LeaveRequestDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'OVERTIME_APPLICATION':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <OvertimeRequestDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
          formData={request.formData}
        />
      );
    case 'FLIGHT_APPLICATION':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <FlightApplicationDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'BUSINESS_TRIP':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <BusinessTripDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'EXPENSE_CLAIM':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <ExpenseClaimDetail approvalRequestId={request.id} sourceId={sourceId} />
      );
    case 'PER_DIEM':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <PerDiemDetail approvalRequestId={request.id} sourceId={sourceId} />
      );
    case 'PER_DIEM_SETTLEMENT':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <PerDiemSettlementDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'PURCHASE_REQUEST':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <PurchaseRequestDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'MATERIAL_REQUISITION':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <MaterialRequisitionDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'CONSUMABLES_REQUISITION':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <ConsumablesRequisitionDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'VEHICLE_APPLICATION':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <VehicleApplicationDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'VEHICLE_REFUELING':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <VehicleRefuelingDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'OFFICIAL_SEAL_USAGE':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <OfficialSealDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'PROJECT_SEAL_USAGE':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <ProjectSealDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'INSPECTION_REPAIR':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <InspectionRepairDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'EXIT_PERMIT':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <ExitPermitDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'FIELD_MOVEMENT_LOG':
      if (!sourceId) {
        return <GenericApprovalDetail request={request} />;
      }
      return (
        <FieldMovementDetail
          approvalRequestId={request.id}
          sourceId={sourceId}
        />
      );
    case 'WORK_FROM_HOME':
      // The request itself is the record (range + days live in formData).
      return <WorkFromHomeDetail request={request} />;
    default:
      return <GenericApprovalDetail request={request} />;
  }
}

/**
 * Approval request detail with typed HR body, tier chain, and approver actions.
 */
export default function ApprovalDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';

  const detailQuery = useApprovalRequest(requestId);
  const approveMutation = useApproveApprovalTier(requestId);
  const rejectMutation = useRejectApprovalTier(requestId);
  const returnMutation = useReturnApprovalTier(requestId);
  const addConditionMutation = useAddApprovalCondition(requestId);
  const resolveConditionMutation = useResolveApprovalCondition(requestId);

  const [actionModal, setActionModal] = useState<ActionModalKind>(null);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [note, setNote] = useState('');
  const [conditionText, setConditionText] = useState('');
  const [approvedRate, setApprovedRate] = useState<number | null>(null);

  // Derive per-diem / overtime source ids early (before conditional returns).
  const _earlyRequest = detailQuery.data;
  const _isPerDiem = Boolean(_earlyRequest) && resolveCategoryCode(_earlyRequest!) === 'PER_DIEM';
  const _perDiemSourceId = _isPerDiem ? (_earlyRequest?.sourceId ?? '') : '';
  const perDiemDetailQuery = usePerDiemRequest(_perDiemSourceId);
  const setApprovedRateMutation = useSetApprovedPerDiemRate(_perDiemSourceId);
  const _isOvertime =
    Boolean(_earlyRequest) &&
    resolveCategoryCode(_earlyRequest!) === 'OVERTIME_APPLICATION';
  const _overtimeSourceId = _isOvertime ? (_earlyRequest?.sourceId ?? '') : '';

  useEffect(() => {
    if (
      (actionModal === 'approve' || actionModal === 'approveOnBehalf') &&
      _isPerDiem &&
      perDiemDetailQuery.data
    ) {
      // Pre-filled with the standard rate (or a rate an earlier tier set).
      const raw = perDiemDetailQuery.data.approvedDailyRate ?? perDiemDetailQuery.data.dailyRate;
      setApprovedRate(parseFloat(String(raw)));
    }
  }, [actionModal, _isPerDiem, perDiemDetailQuery.data]);

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isPerDiem = _isPerDiem;
  const perDiemId = _perDiemSourceId;
  const perDiemDetail = perDiemDetailQuery.data;

  const tiers = useMemo(
    () =>
      [...(request?.tiers ?? [])].sort(
        (a, b) => a.tierOrder - b.tierOrder,
      ),
    [request?.tiers],
  );
  const currentTier = findCurrentTier(tiers, request?.currentTier ?? 0);
  const isRequester =
    Boolean(currentUserId) && request?.requestedBy === currentUserId;
  const isActiveApprover =
    Boolean(currentUserId) &&
    Boolean(currentTier) &&
    currentTier?.approverId === currentUserId &&
    (request?.status === 'PENDING' ||
      request?.status === 'IN_REVIEW' ||
      request?.status === 'SUBMITTED');

  const returnNote = useMemo(() => {
    const returned = [...tiers].reverse().find((t) => t.decision === 'RETURNED');
    return returned?.comment ?? null;
  }, [tiers]);

  const rejectNote = useMemo(() => {
    const rejected = [...tiers].reverse().find((t) => t.decision === 'REJECTED');
    return rejected?.comment ?? null;
  }, [tiers]);

  const responses = request?.responses ?? [];
  const resubmitCount = responses.filter(
    (r) => r.responseType === 'RESUBMIT',
  ).length;

  const hasUnresolvedConditions = useMemo(() => {
    if (!currentTier) {
      return false;
    }
    return parseTierConditions(currentTier.conditions).some(
      (c) => !c.resolved,
    );
  }, [currentTier]);

  const actionsDisabled = hasUnresolvedConditions;

  const unresolvedConditions = useMemo(() => {
    if (
      !currentTier ||
      currentTier.decision !== 'CONDITIONALLY_APPROVED'
    ) {
      return [];
    }
    return parseTierConditions(currentTier.conditions)
      .map((condition, index) => ({ condition, index }))
      .filter(({ condition }) => !condition.resolved);
  }, [currentTier]);

  const displayStatus = request
    ? resolveDisplayStatus(request.status, currentTier, t)
    : null;

  const actionLoading =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    returnMutation.isPending ||
    addConditionMutation.isPending ||
    setApprovedRateMutation.isPending;

  function closeModal(): void {
    setActionModal(null);
    setNote('');
    setConditionText('');
    setApprovedRate(null);
  }

  async function handleApprove(onBehalf = false): Promise<void> {
    if (!currentTier) return;
    if (isPerDiem && perDiemId) {
      if (approvedRate == null || approvedRate <= 0) {
        messageApi.warning(t('pages.approvals.dialog.approvedRateRequired'));
        return;
      }
      try {
        await setApprovedRateMutation.mutateAsync(approvedRate);
      } catch (error) {
        notifyApiError(error, t('pages.approvals.dialog.approveFailed'), messageApi);
        return;
      }
    }
    try {
      await approveMutation.mutateAsync({
        tierId: currentTier.id,
        payload: {
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(onBehalf ? { onBehalf: true } : {}),
        },
      });
      messageApi.success(t('pages.approvals.dialog.approveSuccess'));
      closeModal();
    } catch (error) {
      notifyApiError(
        error,
        t('pages.approvals.dialog.approveFailed'),
        messageApi,
      );
    }
  }

  async function handleConditionalApprove(): Promise<void> {
    if (!currentTier || !conditionText.trim()) {
      messageApi.warning(t('pages.approvals.dialog.conditionalRequired'));
      return;
    }
    try {
      await addConditionMutation.mutateAsync({
        tierId: currentTier.id,
        payload: { text: conditionText.trim() },
      });
      await approveMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success(t('pages.approvals.dialog.conditionalSuccess'));
      closeModal();
    } catch (error) {
      notifyApiError(
        error,
        t('pages.approvals.dialog.conditionalFailed'),
        messageApi,
      );
    }
  }

  async function handleReturn(onBehalf = false): Promise<void> {
    if (!currentTier) return;
    try {
      await returnMutation.mutateAsync({
        tierId: currentTier.id,
        payload: {
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(onBehalf ? { onBehalf: true } : {}),
        },
      });
      messageApi.success(t('pages.approvals.dialog.returnSuccess'));
      closeModal();
    } catch (error) {
      notifyApiError(
        error,
        t('pages.approvals.dialog.returnFailed'),
        messageApi,
      );
    }
  }

  async function handleReject(): Promise<void> {
    if (!currentTier) return;
    try {
      await rejectMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success(t('pages.approvals.dialog.rejectSuccess'));
      closeModal();
    } catch (error) {
      notifyApiError(
        error,
        t('pages.approvals.dialog.rejectFailed'),
        messageApi,
      );
    }
  }

  async function handleResolveCondition(
    tier: ApprovalTier,
    index: number,
  ): Promise<void> {
    try {
      await resolveConditionMutation.mutateAsync({
        tierId: tier.id,
        index,
      });
      messageApi.success(t('pages.approvals.dialog.resolveSuccess'));
    } catch (error) {
      notifyApiError(
        error,
        t('pages.approvals.dialog.resolveFailed'),
        messageApi,
      );
    }
  }

  const decisionMenuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'approve',
        icon: <CheckOutlined />,
        label: t('hr.buttons.approve'),
        disabled: actionsDisabled,
        onClick: () => setActionModal('approve'),
      },
      {
        key: 'conditional',
        icon: <WarningOutlined />,
        label: t('hr.buttons.conditionallyApprove'),
        disabled: actionsDisabled,
        onClick: () => setActionModal('conditional'),
      },
      {
        key: 'return',
        icon: <RollbackOutlined />,
        label: t('hr.buttons.return'),
        disabled: actionsDisabled,
        onClick: () => setActionModal('return'),
      },
      { type: 'divider' },
      {
        key: 'reject',
        icon: <CloseOutlined />,
        label: t('hr.buttons.reject'),
        danger: true,
        disabled: actionsDisabled,
        onClick: () => setActionModal('reject'),
      },
    ],
    [actionsDisabled, t],
  );

  if (detailQuery.isLoading && !request) {
    return (
      <div className={DETAIL_ROOT}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className={DETAIL_ROOT}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('pages.approvals.notFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/approvals')}>
              {t('pages.approvals.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const submittedDate = formatProjectDate(
    request.submittedAt ?? request.createdAt ?? null,
  );
  const submittedByOn = t('pages.approvals.submittedByOn', {
    name: formatApprovalUserName(request.requester),
    date: submittedDate,
  });
  const submittedFor = formatSubmittedFor(request, t);
  const canApproveOnBehalf =
    !isActiveApprover && request.canApproveOnBehalf === true && Boolean(currentTier);
  const assignedApproverName = formatApprovalUserName(currentTier?.approver);
  const categoryName =
    formatApprovalCategoryName(
      request.categoryCode ?? request.category?.code,
      t,
      request.category?.name,
    ) || null;
  const currentTierLabel = currentTier?.label?.trim() || null;
  const categoryCode = resolveCategoryCode(request);
  // Leave edits inline in LeaveRequestDetail; other modules open their edit form.
  const editHref =
    categoryCode !== 'LEAVE_REQUEST' &&
    canEditOwnRequest(request.status, request.requestedBy, currentUserId)
      ? editRequestHref(categoryCode, request.sourceId, request.id)
      : null;
  // The one Resubmit action. Overtime sheets are resubmitted by submitting the
  // sheet again (it refreshes the sheet totals), so they are excluded here.
  const canResubmit =
    categoryCode !== 'OVERTIME_APPLICATION' &&
    canResubmitOwnRequest(request.status, request.requestedBy, currentUserId);

  // Per diem approval: standard rate, optional requested rate, the approver's
  // rate per day (editable) and the resulting approved total.
  const perDiemRateField =
    isPerDiem && perDiemDetail ? (
      <div className="erp-confirm-dialog-field" style={{ marginBottom: 12 }}>
        <div
          className="mb-3 rounded-md p-3"
          style={{ background: 'var(--color-teal-50)', border: '1px solid var(--color-teal-400)' }}
        >
          <p className="erp-confirm-dialog-field-label" style={{ marginBottom: 8 }}>
            {t('pages.approvals.dialog.perDiem.summary')}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="erp-users-cell-sub m-0">
                {t('pages.approvals.dialog.perDiem.standardRate')}
              </p>
              <p className="m-0 font-semibold">
                {t('pages.approvals.dialog.perDiem.perDay', {
                  amount: formatEtbAmount(perDiemDetail.dailyRate),
                })}
              </p>
            </div>
            <div>
              <p className="erp-users-cell-sub m-0">{t('pages.approvals.dialog.perDiem.days')}</p>
              <p className="m-0 font-semibold">{perDiemDetail.days}</p>
            </div>
            {perDiemDetail.requestedDailyRate ? (
              <div>
                <p className="erp-users-cell-sub m-0">
                  {t('pages.approvals.dialog.perDiem.requestedRate')}
                </p>
                <p className="m-0 font-semibold">
                  {t('pages.approvals.dialog.perDiem.perDay', {
                    amount: formatEtbAmount(perDiemDetail.requestedDailyRate),
                  })}
                </p>
              </div>
            ) : null}
            {perDiemDetail.rateOverrideReason ? (
              <div className="col-span-2">
                <p className="erp-users-cell-sub m-0">
                  {t('pages.approvals.dialog.perDiem.overrideReason')}
                </p>
                <p className="m-0">{perDiemDetail.rateOverrideReason}</p>
              </div>
            ) : null}
          </div>
        </div>
        <p className="erp-confirm-dialog-field-label">
          {t('pages.approvals.dialog.perDiem.ratePerDay')}{' '}
          <span aria-hidden style={{ color: 'var(--color-danger, #b42318)' }}>*</span>
        </p>
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          precision={2}
          value={approvedRate}
          onChange={(v) => setApprovedRate(v)}
          aria-label={t('pages.approvals.dialog.perDiem.ratePerDay')}
          suffix="ETB"
        />
        <p className="erp-confirm-dialog-field-label" style={{ marginTop: 8 }}>
          {t('pages.approvals.dialog.perDiem.total', {
            amount: formatEtbAmount((approvedRate ?? 0) * perDiemDetail.days),
          })}
        </p>
      </div>
    ) : null;

  return (
    <div className={DETAIL_ROOT}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/approvals')}
              aria-label={t('pages.approvals.backToList')}
            >
              {isNarrow ? undefined : t('pages.approvals.backToList')}
            </Button>
          </div>
          {editHref || canResubmit ? (
            <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
              {editHref ? (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => router.push(editHref)}
                  aria-label={t('pages.approvals.edit.buttonAria', {
                    number: request.requestNumber,
                  })}
                >
                  {t('pages.approvals.edit.button')}
                </Button>
              ) : null}
              {canResubmit ? (
                <Button
                  type="primary"
                  icon={<RollbackOutlined />}
                  onClick={() => setResubmitOpen(true)}
                >
                  {t('pages.approvals.resubmit.submit')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {canApproveOnBehalf && currentTier ? (
            <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={actionsDisabled}
                title={
                  actionsDisabled
                    ? t('pages.approvals.resolveConditionsFirst')
                    : undefined
                }
                onClick={() => setActionModal('approveOnBehalf')}
              >
                {t('pages.approvals.approveOnBehalf', { name: assignedApproverName })}
              </Button>
              <Button
                icon={<RollbackOutlined />}
                disabled={actionsDisabled}
                onClick={() => setActionModal('returnOnBehalf')}
              >
                {t('pages.approvals.returnOnBehalf', { name: assignedApproverName })}
              </Button>
            </div>
          ) : null}
          {isActiveApprover && currentTier ? (
            <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
              <Dropdown
                menu={{ items: decisionMenuItems }}
                trigger={['click']}
                disabled={actionsDisabled}
              >
                <Button
                  type="primary"
                  disabled={actionsDisabled}
                  title={
                    actionsDisabled
                      ? t('pages.approvals.resolveConditionsFirst')
                      : undefined
                  }
                >
                  {isNarrow
                    ? t('pages.approvals.decide')
                    : t('pages.approvals.decideForTier', {
                        label: currentTier.label,
                      })}
                  <DownOutlined />
                </Button>
              </Dropdown>
            </div>
          ) : null}
        </div>
        {_isOvertime && _overtimeSourceId ? (
          <OvertimeApprovalEditDiff sheetId={_overtimeSourceId} />
        ) : null}

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{request.requestNumber}</span>
              {displayStatus ? (
                <StatusBadge
                  label={displayStatus.label}
                  variant={displayStatus.variant}
                />
              ) : null}
              {categoryName ? (
                <Tag className="!m-0 rounded-lg border-0 bg-[#f2f4f7] text-[#344054]">
                  {categoryName}
                </Tag>
              ) : null}
              {resubmitCount > 0 ? (
                <Tag color="orange" className="!m-0 rounded-lg">
                  {t('pages.approvals.resubmittedCount', {
                    count: resubmitCount,
                  })}
                </Tag>
              ) : null}
              {_isOvertime && _overtimeSourceId ? (
                <OvertimeEditedBadge sheetId={_overtimeSourceId} />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {request.title}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {submittedByOn}
            </p>
            {submittedFor ? (
              <p className="erp-users-email m-0 mt-0.5 break-words sm:text-left">
                {submittedFor}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('pages.approvals.table.submittedBy')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {formatApprovalUserName(request.requester)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('pages.approvals.table.submitted')}
            </p>
            <p className="erp-employee-meta-value">{submittedDate || '-'}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('pages.approvals.table.currentTier')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {currentTierLabel ?? '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-approvals-detail-grid">
        <div className="flex min-w-0 flex-col gap-4">
          <LateSubmissionBanner
            lateSubmission={request.lateSubmission}
            onBehalfSubmittedByName={request.onBehalf?.submittedBy.name}
          />
          {request.status === 'RETURNED' ? (
            <ReturnedBanner note={returnNote} />
          ) : null}
          {request.status === 'REJECTED' ? (
            <RejectedBanner note={rejectNote} />
          ) : null}

          {renderTypedDetail(request)}


          {isRequester &&
          unresolvedConditions.length > 0 &&
          (request.status === 'PENDING' ||
            request.status === 'IN_REVIEW' ||
            request.status === 'SUBMITTED')
            ? unresolvedConditions.map(({ condition, index }) => (
                <ConditionResponsePanel
                  key={`cond-resp-${index}`}
                  requestId={request.id}
                  conditionIndex={index}
                  conditionText={condition.text}
                  existingResponses={responses}
                />
              ))
            : null}

          <ApprovalEventHistory
            request={request}
            tiers={tiers}
            responses={responses}
          />
        </div>

        <ApprovalDetailSidebar
          request={request}
          tiers={tiers}
          currentTier={currentTier}
          isRequester={isRequester}
          isActiveApprover={isActiveApprover}
          currentUserId={currentUserId}
          responses={responses}
          actionsDisabled={actionsDisabled}
          resolveLoading={resolveConditionMutation.isPending}
          onResolveCondition={(tier, index) =>
            void handleResolveCondition(tier, index)
          }
        />
      </div>

      {canResubmit ? (
        <ResubmitRequestDialog
          requestId={request.id}
          open={resubmitOpen}
          onClose={() => setResubmitOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={actionModal === 'approve'}
        className="erp-approval-modal"
        tone="success"
        icon={<CheckOutlined />}
        title={t('pages.approvals.dialog.approveTitle')}
        description={t('pages.approvals.dialog.approveDescription')}
        confirmLabel={t('pages.approvals.dialog.approveConfirm')}
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleApprove()}
      >
        {perDiemRateField}
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.noteLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t('pages.approvals.dialog.notePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'approveOnBehalf'}
        className="erp-approval-modal"
        tone="success"
        icon={<CheckOutlined />}
        title={t('pages.approvals.dialog.approveOnBehalfTitle', {
          name: assignedApproverName,
        })}
        description={t('pages.approvals.dialog.approveOnBehalfDescription', {
          name: assignedApproverName,
          label: currentTier?.label ?? '',
        })}
        confirmLabel={t('pages.approvals.dialog.approveOnBehalfConfirm')}
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleApprove(true)}
      >
        {perDiemRateField}
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.noteLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t('pages.approvals.dialog.notePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'conditional'}
        className="erp-approval-modal"
        tone="warning"
        icon={<WarningOutlined />}
        title={t('pages.approvals.dialog.conditionalTitle')}
        description={t('pages.approvals.dialog.conditionalDescription')}
        confirmLabel={t('pages.approvals.dialog.conditionalConfirm')}
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleConditionalApprove()}
      >
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.conditionLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder={t('pages.approvals.dialog.conditionPlaceholder')}
            value={conditionText}
            onChange={(event) => setConditionText(event.target.value)}
          />
        </div>
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.noteLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder={t('pages.approvals.dialog.notePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'return'}
        className="erp-approval-modal"
        tone="warning"
        icon={<RollbackOutlined />}
        title={t('pages.approvals.dialog.returnTitle')}
        description={t('pages.approvals.dialog.returnDescription')}
        confirmLabel={t('pages.approvals.dialog.returnConfirm')}
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReturn()}
      >
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.returnNoteLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t('pages.approvals.dialog.returnNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'returnOnBehalf'}
        className="erp-approval-modal"
        tone="warning"
        icon={<RollbackOutlined />}
        title={t('pages.approvals.dialog.returnOnBehalfTitle', {
          name: assignedApproverName,
        })}
        description={t('pages.approvals.dialog.returnOnBehalfDescription', {
          name: assignedApproverName,
          label: currentTier?.label ?? '',
        })}
        confirmLabel={t('pages.approvals.dialog.returnOnBehalfConfirm')}
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReturn(true)}
      >
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.returnNoteLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t('pages.approvals.dialog.returnNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'reject'}
        className="erp-approval-modal"
        tone="danger"
        danger
        icon={<CloseOutlined />}
        title={t('pages.approvals.dialog.rejectTitle')}
        description={t('pages.approvals.dialog.rejectDescription')}
        confirmLabel={t('pages.approvals.dialog.rejectConfirm')}
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReject()}
      >
        <div className="erp-confirm-dialog-field">
          <p className="erp-confirm-dialog-field-label">
            {t('pages.approvals.dialog.rejectNoteLabel')}
          </p>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t('pages.approvals.dialog.rejectNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
