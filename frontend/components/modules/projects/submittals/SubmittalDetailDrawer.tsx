// UI polish pass - styles only, no logic changes

'use client';

import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Timeline,
} from 'antd';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type { SubmittalStatus } from '@/lib/api/project-management.types';
import { SUBMITTAL_WORKFLOW } from '@/lib/api/workflow';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAddSubmittalReview,
  useSubmittal,
  useSubmittalReviews,
  useSubmitSubmittalToLead,
  useUpdateSubmittal,
} from '@/lib/query/submittals';
import SubmittalExternalReviewPanel from '@/components/modules/projects/submittals/SubmittalExternalReviewPanel';
import { useIssueSubmittal } from '@/lib/query/epc-submittals';
import { layout, submittalDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSubmittalStatus,
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import {
  nextStatusOptions,
  SUBMITTAL_DIRECT_TRANSITIONS,
  SUBMITTAL_VERDICT_STATUSES,
} from '@/lib/utils/pm-status-transitions';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ReviewFormValues {
  status: SubmittalStatus;
  comments?: string;
}

const SUBMITTAL_REVIEW_STATUS_OPTIONS: SubmittalStatus[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'APPROVED_WITH_COMMENTS',
  'REVISE_AND_RESUBMIT',
  'REJECTED',
];

const REVIEWABLE_SUBMITTAL_STATUSES: SubmittalStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
];

export default function SubmittalDetailDrawer({
  projectId,
  submittalId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  submittalId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<ReviewFormValues>();
  const open = Boolean(submittalId);
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { submittals: submittalsCap } = usePmCapabilities();

  const submittalQuery = useSubmittal(projectId, submittalId ?? '', open);
  const reviewsQuery = useSubmittalReviews(projectId, submittalId ?? '', open);
  const addReview = useAddSubmittalReview();
  const issueSubmittal = useIssueSubmittal();
  const submitToLead = useSubmitSubmittalToLead();
  const updateSubmittal = useUpdateSubmittal();

  const submittal = submittalQuery.data;
  const reviews = reviewsQuery.data ?? [];
  const isConstruction = submittal?.submittalPurpose === 'IN_CONSTRUCTION';
  const isExternalRelease =
    submittal?.submittalPurpose === 'DISCIPLINE_SITE' ||
    submittal?.submittalPurpose === 'DISCIPLINE_CONSULTANT';
  const isAssignedReviewer =
    Boolean(submittal?.assignedTo) &&
    submittal?.assignedTo === currentUserId;
  const isDisciplineLead =
    Boolean(submittal?.disciplineLeadUserId) &&
    submittal?.disciplineLeadUserId === currentUserId;
  const isConstructionReviewer =
    isConstruction &&
    (isAssignedReviewer || isDisciplineLead) &&
    submittal !== undefined &&
    REVIEWABLE_SUBMITTAL_STATUSES.includes(submittal.status);
  const canRecordReview = isConstruction
    ? isConstructionReviewer && (submittalsCap.canView || submittalsCap.canEdit)
    : submittalsCap.canCreate &&
      isAssignedReviewer &&
      submittal !== undefined &&
      REVIEWABLE_SUBMITTAL_STATUSES.includes(submittal.status);
  const canSubmitToLead =
    isConstruction &&
    submittal?.status === 'DRAFT' &&
    submittal?.submittedBy === currentUserId &&
    submittalsCap.canCreate;
  const canResubmitToLead =
    isConstruction &&
    submittal?.status === 'REVISE_AND_RESUBMIT' &&
    submittal?.submittedBy === currentUserId &&
    submittalsCap.canCreate;
  const isSubmitter =
    submittal !== undefined && submittal.submittedBy === currentUserId;
  const canEditResubmission =
    isConstruction &&
    isSubmitter &&
    (submittal.status === 'DRAFT' ||
      submittal.status === 'REVISE_AND_RESUBMIT');
  const canRecallToDraft =
    isConstruction &&
    submittal?.status === 'SUBMITTED' &&
    submittal?.submittedBy === currentUserId &&
    submittalsCap.canEdit;
  const canUploadAttachments =
    submittal !== undefined &&
    ((canEditResubmission && submittalsCap.canCreate) ||
      (isConstructionReviewer &&
        (submittalsCap.canView || submittalsCap.canEdit)));
  const showDirectStatusControl =
    submittal !== undefined &&
    !isConstruction &&
    !SUBMITTAL_VERDICT_STATUSES.includes(submittal.status) &&
    nextStatusOptions(submittal.status, SUBMITTAL_DIRECT_TRANSITIONS).length >
      0;

  const latestReview =
    reviews.length > 0 ? reviews[reviews.length - 1] : undefined;

  async function handleAddReview(values: ReviewFormValues): Promise<void> {
    if (!submittalId || !submittal) {
      return;
    }
    try {
      await addReview.mutateAsync({
        projectId,
        submittalId,
        body: {
          status: values.status,
          comments: values.comments?.trim() || undefined,
          revisionNumber: submittal.revisionNumber,
        },
      });
      form.resetFields();
      messageApi.success('Review recorded');
      onUpdated();
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to record review', messageApi);
    }
  }

  async function handleSubmitToLead(): Promise<void> {
    if (!submittalId) {
      return;
    }
    try {
      await submitToLead.mutateAsync({ projectId, submittalId });
      messageApi.success(
        submittal?.status === 'REVISE_AND_RESUBMIT'
          ? 'Revised submittal resubmitted to discipline leader'
          : 'Submittal submitted to discipline leader',
      );
      onUpdated();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit submittal', messageApi);
    }
  }

  async function handleRecallToDraft(): Promise<void> {
    if (!submittalId) {
      return;
    }
    try {
      await updateSubmittal.mutateAsync({
        projectId,
        submittalId,
        body: { status: 'DRAFT' },
      });
      messageApi.success('Submittal recalled to draft');
      onUpdated();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to recall submittal', messageApi);
    }
  }

  async function handleDirectStatusChange(status: SubmittalStatus): Promise<void> {
    if (!submittalId || !submittal) return;
    try {
      await updateSubmittal.mutateAsync({
        projectId,
        submittalId,
        body: { status },
      });
      messageApi.success('Submittal status updated');
      onUpdated();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update submittal status', messageApi);
    }
  }

  return (
    <Drawer
      {...submittalDrawerProps}
      open={open}
      onClose={onClose}
      title={
        submittal
          ? `${submittal.submittalNumber} - ${submittal.title}`
          : 'Submittal detail'
      }
      destroyOnHidden
    >
      {submittalQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-32 w-full rounded" />
        </div>
      )}

      {submittalQuery.isError && (
        <p className={layout.drawerMutedText}>
          {submittalQuery.error instanceof ApiRequestError
            ? submittalQuery.error.message
            : 'Unable to load submittal.'}
        </p>
      )}

      {submittal && (
        <div className={layout.drawerStack}>
          <WorkflowStepper
            className="erp-drawer-workflow"
            steps={SUBMITTAL_WORKFLOW}
            currentStatus={submittal.status}
          />

          <Descriptions
            className={layout.drawerDescriptionsClass}
            column={1}
            size="small"
            bordered
          >
            <Descriptions.Item label="Status">
              <StatusBadge
                label={formatSubmittalStatus(submittal.status)}
                variant={submittalStatusVariant(submittal.status)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Category">
              {submittal.category}
            </Descriptions.Item>
            <Descriptions.Item label="Revision">
              {submittal.revisionNumber}
            </Descriptions.Item>
            <Descriptions.Item label="Spec reference">
              {submittal.specReference ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Contractor">
              {submittal.contractor ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Supplier">
              {submittal.supplier ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Submitted by">
              {resolveUserDisplay(submittal.submittedBy, submittal.submittedByName)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {resolveUserDisplay(submittal.assignedTo, submittal.assignedToName, '-')}
            </Descriptions.Item>
            <Descriptions.Item label="Reviewed by">
              {resolveUserDisplay(submittal.reviewedBy, submittal.reviewedByName, '-')}
            </Descriptions.Item>
            <Descriptions.Item label="Submission date">
              {formatProjectDate(submittal.submissionDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(submittal.dueDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Review date">
              {formatProjectDate(submittal.reviewDate)}
            </Descriptions.Item>
            {submittal.issuedAt && (
              <Descriptions.Item label="Issued at">
                {formatProjectDate(submittal.issuedAt)}
              </Descriptions.Item>
            )}
          </Descriptions>

          {showDirectStatusControl && (
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Update status</p>
              <Select
                className="w-full max-w-xs"
                value={submittal.status}
                onChange={(value: SubmittalStatus) =>
                  void handleDirectStatusChange(value)
                }
                loading={updateSubmittal.isPending}
                options={nextStatusOptions(
                  submittal.status,
                  SUBMITTAL_DIRECT_TRANSITIONS,
                ).map((status) => ({
                  value: status,
                  label: formatSubmittalStatus(status),
                }))}
              />
            </section>
          )}

          {SUBMITTAL_VERDICT_STATUSES.includes(submittal.status) && (
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Review outcome</p>
              <div className="flex flex-col gap-2">
                <StatusBadge
                  label={formatSubmittalStatus(submittal.status)}
                  variant={submittalStatusVariant(submittal.status)}
                />
                <p className={layout.drawerMutedText}>
                  Set via review — cannot be changed directly.
                </p>
              </div>
            </section>
          )}

          {submittal.items.length > 0 && (
            <div>
              <h3 className={`${layout.drawerHeading} mb-2`}>
                Linked design packages
              </h3>
              <div className="erp-drawer-list">
                {submittal.items.map((item) => (
                  <div key={item.id} className={`px-4 py-3 ${layout.drawerMutedText}`}>
                    Package {item.sortOrder + 1}
                    {item.snapshotCaptured ? ' (snapshot captured)' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DocumentAttachmentPanel
            folderId={submittal.attachmentFolderId ?? undefined}
            readOnly={!canUploadAttachments}
            title={
              isConstructionReviewer
                ? 'Review attachments'
                : canResubmitToLead
                  ? 'Revised documents'
                  : 'Supporting documents'
            }
            description={
              isConstructionReviewer
                ? 'Upload marked-up drawings, review comments, and other response files before recording your review.'
                : canResubmitToLead
                  ? 'Upload the revised shop drawings, product data, or other documents addressing the discipline leader comments.'
                  : 'Upload shop drawings, product data sheets, samples photos, and other approval documents.'
            }
          />

          {canRecallToDraft && submittalId && (
            <Alert
              type="info"
              showIcon
              title="Submitted for review"
              description="You can recall this submittal to draft if you need to make changes before the discipline leader reviews it."
              action={
                <Button
                  loading={updateSubmittal.isPending}
                  onClick={() => void handleRecallToDraft()}
                >
                  Recall to draft
                </Button>
              }
            />
          )}

          {canResubmitToLead && submittalId && (
            <Alert
              type="warning"
              showIcon
              title="Revision required"
              description={
                latestReview?.comments
                  ? `Discipline leader comments: ${latestReview.comments}`
                  : 'Address the discipline leader comments, upload revised documents, then resubmit for review.'
              }
              action={
                <Button
                  type="primary"
                  loading={submitToLead.isPending}
                  onClick={() => void handleSubmitToLead()}
                >
                  Resubmit to discipline leader
                </Button>
              }
            />
          )}

          {canSubmitToLead && submittalId && (
            <Alert
              type="warning"
              showIcon
              title="Ready to submit?"
              description="Attach design packages and upload your document package, then submit directly to the discipline leader for approval."
              action={
                <Button
                  type="primary"
                  loading={submitToLead.isPending}
                  onClick={() => void handleSubmitToLead()}
                >
                  Submit to discipline leader
                </Button>
              }
            />
          )}

          <section className={layout.drawerSection}>
            <h3 className={`${layout.drawerHeading} mb-3`}>
              Review history
            </h3>
            {reviews.length === 0 ? (
              <p className={layout.drawerMutedText}>No reviews recorded yet.</p>
            ) : (
              <Timeline
                className="erp-drawer-timeline"
                items={reviews.map((review) => ({
                  content: (
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={formatSubmittalStatus(review.status)}
                          variant={submittalStatusVariant(review.status)}
                        />
                        <span className={layout.drawerMetaLabel}>
                          Rev {review.revisionNumber} ·{' '}
                          {formatProjectDate(review.reviewedAt)}
                        </span>
                      </div>
                      <p className={`mt-1 ${layout.drawerMutedText}`}>
                        {resolveUserDisplay(review.reviewedBy, review.reviewedByName)}
                      </p>
                      {review.comments && (
                        <p className={`mt-2 whitespace-pre-wrap ${layout.drawerMutedText}`}>
                          {review.comments}
                        </p>
                      )}
                    </div>
                  ),
                }))}
              />
            )}

            {canRecordReview && (
              <Form<ReviewFormValues>
                form={form}
                layout="vertical"
                className="erp-drawer-form mt-4"
                initialValues={{ status: 'APPROVED' }}
                onFinish={(values: ReviewFormValues) =>
                  void handleAddReview(values)
                }
              >
                <Form.Item
                  label="Review outcome"
                  name="status"
                  rules={[{ required: true, message: 'Select review outcome' }]}
                >
                  <Select
                    options={SUBMITTAL_WORKFLOW.filter((step) =>
                      SUBMITTAL_REVIEW_STATUS_OPTIONS.includes(
                        step.key as SubmittalStatus,
                      ),
                    ).map((step) => ({
                      value: step.key,
                      label: step.label,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  label="Comments"
                  name="comments"
                  rules={[
                    {
                      required: true,
                      message: 'Enter review comments',
                    },
                  ]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="Review comments, conditions, and required revisions"
                  />
                </Form.Item>
                <p className={`mb-3 ${layout.drawerMutedText}`}>
                  Attach marked-up files in the section above, then record your
                  review outcome.
                </p>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={addReview.isPending}
                >
                  Record review
                </Button>
              </Form>
            )}

            {!canRecordReview &&
              isConstruction &&
              submittal.status === 'SUBMITTED' &&
              submittal.submittedBy === currentUserId && (
                <Alert
                  type="info"
                  showIcon
                  className="mt-4"
                  title="Awaiting discipline leader review"
                  description="Your submittal has been submitted. The assigned discipline leader will record the approval outcome."
                />
              )}

            {!canRecordReview &&
              isConstruction &&
              submittal.status === 'SUBMITTED' &&
              submittal.submittedBy !== currentUserId &&
              !isDisciplineLead &&
              !isAssignedReviewer && (
                <Alert
                  type="info"
                  showIcon
                  className="mt-4"
                  title="Awaiting discipline leader review"
                  description="This submittal is with the assigned discipline leader for approval."
                />
              )}
          </section>

          {isExternalRelease && submittalId && (
            <SubmittalExternalReviewPanel submittalId={submittalId} />
          )}

          {isExternalRelease &&
            submittal.status === 'DRAFT' &&
            submittal.items.length > 0 &&
            submittalId && (
              <Button
                type="primary"
                loading={issueSubmittal.isPending}
                onClick={() => {
                  void issueSubmittal
                    .mutateAsync({ projectId, submittalId })
                    .then(() => {
                      messageApi.success('Submittal issued to external reviewers');
                      onUpdated();
                      void submittalQuery.refetch();
                    })
                    .catch((error: unknown) => {
                      notifyApiError(error, 'Failed to issue submittal', messageApi);
                    });
                }}
              >
                Issue to site / consultant
              </Button>
            )}
        </div>
      )}
    </Drawer>
  );
}
