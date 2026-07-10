'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Space, Tooltip, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import {
  useAddSessionAttachment,
  useApproveReviewSession,
  useDesignPackage,
  useReturnPackageForRework,
} from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useDisciplineUploadFolder } from '@/lib/query/engineering-documents';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { usePackageRoleLens } from '@/lib/hooks/use-package-role-lens';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import type { ReviewModeComment, ReviewTier } from '@/lib/api/epc.types';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  getNextReviewTier,
  getPreviousReviewTier,
  reviewTierBilingualLabel,
} from '@/lib/utils/review-tier-display';
import {
  canUserActAtCurrentReviewTier,
  isFinalReviewTier,
  isGovernanceReviewTier,
} from '@/lib/utils/review-governance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

export default function DisciplineLeadConsole({
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  sessionStatus,
  currentTier,
  requiredTiers,
  instituteChiefUserId,
  instituteChiefName,
  comments,
  allDocumentsApproved,
  onAction,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string | null;
  sessionStatus: string | null;
  currentTier: string | null;
  requiredTiers: ReadonlyArray<ReviewTier | string>;
  instituteChiefUserId: string | null;
  instituteChiefName: string | null;
  comments: readonly ReviewModeComment[];
  allDocumentsApproved: boolean;
  onAction: () => void;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId) && Boolean(packageId),
  );
  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId);
  const packageLens = usePackageRoleLens(
    packageQuery.data,
    disciplineQuery.data,
    (currentTier as ReviewTier | null | undefined) ?? null,
  );
  const approveSession = useApproveReviewSession();
  const returnPackage = useReturnPackageForRework();
  const addSessionAttachment = useAddSessionAttachment(
    projectId,
    taskDisciplineId,
    packageId,
    reviewSessionId ?? '',
  );
  const uploadDocument = useUploadDocumentToFolder();
  const uploadFolderQuery = useDisciplineUploadFolder(projectId, taskDisciplineId);
  const [approveOnBehalf, setApproveOnBehalf] = useState(false);
  const [onBehalfOfName, setOnBehalfOfName] = useState(instituteChiefName ?? '');
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveButtonLocked, setApproveButtonLocked] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [attachmentDocumentId, setAttachmentDocumentId] = useState<string | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState<string | null>(null);
  const [isConfirmingApproval, setIsConfirmingApproval] = useState(false);
  const [recentEscalation, setRecentEscalation] = useState<{
    fromTier: string;
    at: string;
  } | null>(null);

  const requiredTierList = useMemo(
    () => requiredTiers as readonly ReviewTier[],
    [requiredTiers],
  );

  useEffect(() => {
    setRecentEscalation(null);
    setApproveButtonLocked(false);
  }, [reviewSessionId]);

  if (permLoading) {
    return null;
  }

  if (!lens.canApproveReview || !reviewSessionId) {
    return null;
  }

  const isGovernanceTier = isGovernanceReviewTier(currentTier);

  if (!isGovernanceTier) {
    return null;
  }

  const canActAtCurrentTier = canUserActAtCurrentReviewTier(
    packageLens,
    disciplineQuery.data,
    currentUserId,
    currentTier,
    instituteChiefUserId,
    lens.canApproveReview,
  );
  const isActiveSession = sessionStatus === 'ACTIVE';
  const showActionConsole = canActAtCurrentTier && isActiveSession;
  const showReadOnlyConsole = !showActionConsole && isActiveSession;

  if (!showActionConsole && !showReadOnlyConsole) {
    return null;
  }

  const approvalAllowed = canApproveReviewSession(comments.map((comment) => comment.status));
  const isFinalTier = isFinalReviewTier(currentTier, requiredTiers);
  const tierLabel = reviewTierBilingualLabel(currentTier ?? '');
  const nextTier = getNextReviewTier(currentTier, requiredTierList);
  const nextTierLabel = nextTier ? reviewTierBilingualLabel(nextTier) : null;
  const isInstituteChiefProxyEligible =
    currentTier === 'INSTITUTE_CHIEF' && !instituteChiefUserId;
  const canSubmitApproval =
    approvalAllowed &&
    allDocumentsApproved &&
    (!approveOnBehalf || onBehalfOfName.trim().length > 0);
  const approveEscalateLabel = isFinalTier ? 'Approve' : 'Approve & escalate';
  const approveEscalateDisabled = !canSubmitApproval || approveButtonLocked;
  const approveEscalateTooltip =
    !allDocumentsApproved
      ? 'Approve all documents before escalating.'
      : !approvalAllowed
        ? 'Resolve blocking comments before approving.'
        : undefined;
  const approveModalTitle = isFinalTier
    ? 'Approve — close package'
    : `Approve & escalate to ${nextTierLabel ?? 'next tier'}`;
  const previousTier =
    recentEscalation?.fromTier ??
    getPreviousReviewTier(currentTier, requiredTierList);
  const previousTierLabel = previousTier
    ? reviewTierBilingualLabel(previousTier)
    : null;
  const escalationDate = recentEscalation?.at ?? null;

  function resetApproveModalState(): void {
    setApproveNote('');
    setAttachmentDocumentId(null);
    setAttachmentFileName(null);
  }

  function closeApproveModal(): void {
    setApproveModalOpen(false);
    setApproveButtonLocked(false);
    resetApproveModalState();
  }

  function openApproveModal(): void {
    setApproveButtonLocked(true);
    setApproveModalOpen(true);
  }

  async function handleConfirmApproval(): Promise<void> {
    if (!reviewSessionId || !canSubmitApproval || !currentTier) {
      return;
    }

    setIsConfirmingApproval(true);
    try {
      if (attachmentDocumentId) {
        await addSessionAttachment.mutateAsync({
          documentId: attachmentDocumentId,
          note: approveNote.trim() || undefined,
        });
      }

      await approveSession.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
        reviewSessionId,
        body: approveOnBehalf
          ? { approvedOnBehalfOfName: onBehalfOfName.trim() }
          : undefined,
      });

      setRecentEscalation({
        fromTier: currentTier,
        at: new Date().toISOString(),
      });
      messageApi.success('Session approved');
      closeApproveModal();
      onAction();
    } catch (error: unknown) {
      notifyApiError(error, 'Request failed', messageApi);
      setApproveButtonLocked(false);
    } finally {
      setIsConfirmingApproval(false);
    }
  }

  if (showReadOnlyConsole) {
    return (
      <FormLayout
        title={`${tierLabel} console`}
        description="You approved at the previous tier. The session is now with the next reviewer."
      >
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {previousTierLabel ? (
            <p>
              Approved at {previousTierLabel}
              {escalationDate ? ` on ${formatProjectDate(escalationDate)}` : ''}. Now with{' '}
              {tierLabel}.
            </p>
          ) : (
            <p>Now with {tierLabel}.</p>
          )}
        </div>
      </FormLayout>
    );
  }

  return (
    <FormLayout
      title={`${tierLabel} console`}
      description={`Approve or return at the ${tierLabel} tier.`}
    >
      <ReviewApprovalBlockedAlert comments={comments} />
      {isInstituteChiefProxyEligible && (
        <div className="mb-3 space-y-2">
          <Checkbox
            checked={approveOnBehalf}
            onChange={(event) => setApproveOnBehalf(event.target.checked)}
          >
            Approve on behalf of Institute Chief
          </Checkbox>
          {approveOnBehalf && (
            <Input
              placeholder="Institute Chief's name"
              value={onBehalfOfName}
              onChange={(event) => setOnBehalfOfName(event.target.value)}
            />
          )}
        </div>
      )}
      <Space wrap>
        <Tooltip title={approveEscalateTooltip}>
          <span>
            <Button
              type="primary"
              disabled={approveEscalateDisabled}
              onClick={openApproveModal}
            >
              {approveEscalateLabel}
            </Button>
          </span>
        </Tooltip>
        <Button
          danger
          loading={returnPackage.isPending}
          onClick={() => {
            void returnPackage
              .mutateAsync({
                projectId,
                taskDisciplineId,
                packageId,
                body: {
                  reviewSessionId,
                  reason: `Returned by ${tierLabel}`,
                },
              })
              .then(() => {
                messageApi.success('Package returned');
                onAction();
              })
              .catch((error: unknown) => {
                notifyApiError(error, 'Request failed', messageApi);
              });
          }}
        >
          Return for rework
        </Button>
      </Space>

      <Modal
        title={approveModalTitle}
        open={approveModalOpen}
        onCancel={closeApproveModal}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={closeApproveModal} disabled={isConfirmingApproval}>
              Cancel
            </Button>
            <Button
              type="primary"
              loading={isConfirmingApproval}
              disabled={!canSubmitApproval}
              onClick={() => void handleConfirmApproval()}
            >
              Confirm
            </Button>
          </Space>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-slate-700">Optional file attachment</p>
            <Upload
              maxCount={1}
              showUploadList={false}
              disabled={!uploadFolderQuery.data?.id || uploadDocument.isPending || isConfirmingApproval}
              beforeUpload={(file: File) => {
                const folderId = uploadFolderQuery.data?.id;
                if (!folderId) {
                  messageApi.error('Upload folder is not ready');
                  return Upload.LIST_IGNORE;
                }
                void uploadDocument
                  .mutateAsync({ folderId, file })
                  .then((record) => {
                    setAttachmentDocumentId(record.id);
                    setAttachmentFileName(file.name);
                    messageApi.success('File attached');
                  })
                  .catch((error: unknown) => {
                    notifyApiError(error, 'Failed to upload file', messageApi);
                  });
                return false;
              }}
            >
              <Button
                icon={<UploadOutlined />}
                loading={uploadDocument.isPending}
                disabled={isConfirmingApproval}
              >
                Attach file
              </Button>
            </Upload>
            {attachmentFileName ? (
              <p className="mt-2 text-sm text-slate-600">Attached: {attachmentFileName}</p>
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-sm text-slate-700">Note for next reviewer</p>
            <Input.TextArea
              rows={3}
              value={approveNote}
              placeholder="Add a note for the next reviewer (optional)"
              disabled={isConfirmingApproval}
              onChange={(event) => setApproveNote(event.target.value)}
            />
          </div>
        </div>
      </Modal>
    </FormLayout>
  );
}
