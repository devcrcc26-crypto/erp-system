'use client';

import { useMemo, useState } from 'react';
import { Button, Grid, Input, Skeleton, Tag } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalDetailSidebar from '@/components/modules/approvals/ApprovalDetailSidebar';
import GenericApprovalDetail from '@/components/modules/approvals/detail/GenericApprovalDetail';
import BusinessTripDetail from '@/components/modules/approvals/detail/BusinessTripDetail';
import ExpenseClaimDetail from '@/components/modules/approvals/detail/ExpenseClaimDetail';
import FlightApplicationDetail from '@/components/modules/approvals/detail/FlightApplicationDetail';
import LeaveRequestDetail from '@/components/modules/approvals/detail/LeaveRequestDetail';
import OvertimeRequestDetail from '@/components/modules/approvals/detail/OvertimeRequestDetail';
import PerDiemDetail from '@/components/modules/approvals/detail/PerDiemDetail';
import PurchaseRequestDetail from '@/components/modules/approvals/detail/PurchaseRequestDetail';
import MaterialRequisitionDetail from '@/components/modules/approvals/detail/MaterialRequisitionDetail';
import ConsumablesRequisitionDetail from '@/components/modules/approvals/detail/ConsumablesRequisitionDetail';
import VehicleApplicationDetail from '@/components/modules/approvals/detail/VehicleApplicationDetail';
import VehicleRefuelingDetail from '@/components/modules/approvals/detail/VehicleRefuelingDetail';
import OfficialSealDetail from '@/components/modules/approvals/detail/OfficialSealDetail';
import ProjectSealDetail from '@/components/modules/approvals/detail/ProjectSealDetail';
import InspectionRepairDetail from '@/components/modules/approvals/detail/InspectionRepairDetail';
import ConditionResponsePanel from '@/components/modules/approvals/ConditionResponsePanel';
import RejectedBanner from '@/components/modules/approvals/RejectedBanner';
import ResubmitPanel, {
  ResponseHistory,
} from '@/components/modules/approvals/ResubmitPanel';
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
import { useCurrentUser } from '@/lib/query/profile';
import {
  findCurrentTier,
  formatApprovalUserName,
  parseTierConditions,
  resolveDisplayStatus,
} from '@/lib/utils/approval-display';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

type ActionModalKind = 'approve' | 'conditional' | 'return' | 'reject' | null;

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
  const [note, setNote] = useState('');
  const [conditionText, setConditionText] = useState('');

  useSetHeaderExtra(null);

  const request = detailQuery.data;
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
    addConditionMutation.isPending;

  function closeModal(): void {
    setActionModal(null);
    setNote('');
    setConditionText('');
  }

  async function handleApprove(): Promise<void> {
    if (!currentTier) return;
    try {
      await approveMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Tier approved');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to approve tier', messageApi);
    }
  }

  async function handleConditionalApprove(): Promise<void> {
    if (!currentTier || !conditionText.trim()) {
      messageApi.warning('Enter a condition before continuing');
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
      messageApi.success('Conditionally approved');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to conditionally approve', messageApi);
    }
  }

  async function handleReturn(): Promise<void> {
    if (!currentTier) return;
    try {
      await returnMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Request returned to submitter');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to return request', messageApi);
    }
  }

  async function handleReject(): Promise<void> {
    if (!currentTier) return;
    try {
      await rejectMutation.mutateAsync({
        tierId: currentTier.id,
        payload: note.trim() ? { note: note.trim() } : undefined,
      });
      messageApi.success('Request rejected');
      closeModal();
    } catch (error) {
      notifyApiError(error, 'Failed to reject request', messageApi);
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
      messageApi.success('Condition marked resolved');
    } catch (error) {
      notifyApiError(error, 'Failed to resolve condition', messageApi);
    }
  }

  if (detailQuery.isLoading && !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-approvals-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-approvals-detail-page">
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
  const categoryName = request.category?.name?.trim() || null;
  const currentTierLabel = currentTier?.label?.trim() || null;

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-approvals-detail-page">
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
          {isActiveApprover && currentTier ? (
            <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
              <Button
                type="primary"
                disabled={actionsDisabled}
                title={
                  actionsDisabled
                    ? 'Resolve all conditions before approving'
                    : undefined
                }
                onClick={() => setActionModal('approve')}
              >
                {t('hr.buttons.approve')}
              </Button>
              <Button
                disabled={actionsDisabled}
                onClick={() => setActionModal('conditional')}
              >
                {t('hr.buttons.conditionallyApprove')}
              </Button>
              <Button
                disabled={actionsDisabled}
                onClick={() => setActionModal('return')}
              >
                {t('hr.buttons.return')}
              </Button>
              <Button
                danger
                disabled={actionsDisabled}
                onClick={() => setActionModal('reject')}
              >
                {t('hr.buttons.reject')}
              </Button>
            </div>
          ) : null}
        </div>

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
              {categoryName ? <Tag className="rounded-xl">{categoryName}</Tag> : null}
              {resubmitCount > 0 ? (
                <Tag color="orange" className="rounded-xl">
                  {t('pages.approvals.resubmittedCount', {
                    count: resubmitCount,
                  })}
                </Tag>
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
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('pages.approvals.table.category')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {categoryName ?? '—'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('pages.approvals.table.submitted')}
            </p>
            <p className="erp-employee-meta-value">{submittedDate || '—'}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('pages.approvals.table.currentTier')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {currentTierLabel ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_360px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            {request.status === 'RETURNED' ? (
              <ReturnedBanner note={returnNote} />
            ) : null}
            {request.status === 'REJECTED' ? (
              <RejectedBanner note={rejectNote} />
            ) : null}

            {renderTypedDetail(request)}

            {isRequester && request.status === 'RETURNED' ? (
              <ResubmitPanel requestId={request.id} returnNote={returnNote} />
            ) : null}

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

            {responses.length > 0 ? (
              <ResponseHistory responses={responses} />
            ) : null}
          </div>
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
          onApprove={() => setActionModal('approve')}
          onConditionalApprove={() => setActionModal('conditional')}
          onReturn={() => setActionModal('return')}
          onReject={() => setActionModal('reject')}
          onResolveCondition={(tier, index) =>
            void handleResolveCondition(tier, index)
          }
        />
      </div>

      <ConfirmDialog
        open={actionModal === 'approve'}
        title="Approve tier"
        description="Confirm approval of the current tier."
        confirmLabel="Approve"
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleApprove()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Optional note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 12 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'conditional'}
        title="Conditionally approve"
        description="Add a condition that must be resolved before the chain advances."
        confirmLabel="Submit"
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleConditionalApprove()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Condition text (required)"
          value={conditionText}
          onChange={(event) => setConditionText(event.target.value)}
          style={{ marginTop: 12 }}
        />
        <Input.TextArea
          rows={2}
          placeholder="Optional note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 8 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'return'}
        title="Return request"
        description="Return this request to the submitter for revision."
        confirmLabel="Return"
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReturn()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Note for submitter"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 12 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={actionModal === 'reject'}
        title="Reject request"
        description="This will reject the request permanently. Confirm to continue."
        confirmLabel="Reject"
        danger
        confirmLoading={actionLoading}
        onCancel={closeModal}
        onConfirm={() => void handleReject()}
      >
        <Input.TextArea
          rows={3}
          placeholder="Rejection reason"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 12 }}
        />
      </ConfirmDialog>
    </div>
  );
}
