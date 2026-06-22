'use client';

import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  List,
  Select,
  Spin,
  Timeline,
} from 'antd';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type { SubmittalStatus } from '@/lib/api/project-management.types';
import { SUBMITTAL_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  useAddSubmittalReview,
  useSubmittal,
  useSubmittalReviews,
  useSubmitSubmittalToLead,
  useUpdateSubmittal,
} from '@/lib/query/submittals';
import SubmittalExternalReviewPanel from '@/components/modules/projects/submittals/SubmittalExternalReviewPanel';
import { useIssueSubmittal } from '@/lib/query/epc-submittals';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSubmittalStatus,
  submittalStatusVariant,
} from '@/lib/utils/pm-status-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ReviewFormValues {
  status: SubmittalStatus;
  comments?: string;
}

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
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();

  const submittalQuery = useSubmittal(projectId, submittalId ?? '', open);
  const reviewsQuery = useSubmittalReviews(projectId, submittalId ?? '', open);
  const updateSubmittal = useUpdateSubmittal();
  const addReview = useAddSubmittalReview();
  const issueSubmittal = useIssueSubmittal();
  const submitToLead = useSubmitSubmittalToLead();

  const submittal = submittalQuery.data;
  const reviews = reviewsQuery.data ?? [];
  const isConstruction = submittal?.submittalPurpose === 'IN_CONSTRUCTION';
  const isExternalRelease =
    submittal?.submittalPurpose === 'DISCIPLINE_SITE' ||
    submittal?.submittalPurpose === 'DISCIPLINE_CONSULTANT';

  async function handleStatusChange(status: SubmittalStatus): Promise<void> {
    if (!submittalId || !submittal) {
      return;
    }
    await updateSubmittal.mutateAsync({
      projectId,
      submittalId,
      body: { status },
    });
    onUpdated();
    void submittalQuery.refetch();
  }

  async function handleAddReview(values: ReviewFormValues): Promise<void> {
    if (!submittalId || !submittal) {
      return;
    }
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
    onUpdated();
    void reviewsQuery.refetch();
    void submittalQuery.refetch();
  }

  async function handleSubmitToLead(): Promise<void> {
    if (!submittalId) {
      return;
    }
    try {
      await submitToLead.mutateAsync({ projectId, submittalId });
      messageApi.success('Submittal submitted to discipline leader');
      onUpdated();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit submittal', messageApi);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        submittal
          ? `${submittal.submittalNumber} — ${submittal.title}`
          : 'Submittal detail'
      }
      size="large"
      destroyOnHidden
    >
      {submittalQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      )}

      {submittalQuery.isError && (
        <p className="text-sm text-slate-500">
          {submittalQuery.error instanceof ApiRequestError
            ? submittalQuery.error.message
            : 'Unable to load submittal.'}
        </p>
      )}

      {submittal && (
        <div className="space-y-6">
          <WorkflowStepper
            steps={SUBMITTAL_WORKFLOW}
            currentStatus={submittal.status}
          />

          <Descriptions column={1} size="small" bordered>
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
              {submittal.specReference ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Contractor">
              {submittal.contractor ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Supplier">
              {submittal.supplier ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Submitted by">
              {resolveUserName(submittal.submittedBy)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {submittal.assignedTo
                ? resolveUserName(submittal.assignedTo)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Reviewed by">
              {submittal.reviewedBy
                ? resolveUserName(submittal.reviewedBy)
                : '—'}
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

          {submittal.items.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Linked design packages
              </h3>
              <List
                size="small"
                bordered
                dataSource={submittal.items}
                renderItem={(item) => (
                  <List.Item>
                    <span className="text-sm text-slate-700">
                      Package {item.sortOrder + 1}
                      {item.snapshotCaptured ? ' (snapshot captured)' : ''}
                    </span>
                  </List.Item>
                )}
              />
            </div>
          )}

          <DocumentAttachmentPanel
            folderId={submittal.attachmentFolderId ?? undefined}
            readOnly={submittal.status !== 'DRAFT'}
            title="Supporting documents"
            description="Upload shop drawings, product data sheets, samples photos, and other approval documents."
          />

          {isConstruction && submittal.status === 'DRAFT' && submittalId && (
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

          {(isConstruction || isExternalRelease) && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Update status
              </p>
              <Select
                className="w-full max-w-sm"
                value={submittal.status}
                onChange={(value: SubmittalStatus) =>
                  void handleStatusChange(value)
                }
                loading={updateSubmittal.isPending}
                options={SUBMITTAL_WORKFLOW.map((step) => ({
                  value: step.key,
                  label: step.label,
                }))}
              />
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Review history
            </h3>
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-500">No reviews recorded yet.</p>
            ) : (
              <Timeline
                items={reviews.map((review) => ({
                  content: (
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={formatSubmittalStatus(review.status)}
                          variant={submittalStatusVariant(review.status)}
                        />
                        <span className="text-xs text-slate-500">
                          Rev {review.revisionNumber} ·{' '}
                          {formatProjectDate(review.reviewedAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {resolveUserName(review.reviewedBy)}
                      </p>
                      {review.comments && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                          {review.comments}
                        </p>
                      )}
                    </div>
                  ),
                }))}
              />
            )}

            <Form<ReviewFormValues>
              form={form}
              layout="vertical"
              className="mt-4"
              initialValues={{ status: submittal.status }}
              onFinish={(values: ReviewFormValues) =>
                void handleAddReview(values)
              }
            >
              <Form.Item
                label="Record review"
                name="status"
                rules={[{ required: true, message: 'Select review status' }]}
              >
                <Select
                  options={SUBMITTAL_WORKFLOW.filter((step) =>
                    [
                      'APPROVED',
                      'APPROVED_WITH_COMMENTS',
                      'REVISE_AND_RESUBMIT',
                      'REJECTED',
                      'UNDER_REVIEW',
                    ].includes(step.key),
                  ).map((step) => ({
                    value: step.key,
                    label: step.label,
                  }))}
                />
              </Form.Item>
              <Form.Item label="Comments" name="comments">
                <Input.TextArea
                  rows={3}
                  placeholder="Review comments and markup notes"
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={addReview.isPending}
              >
                Add review entry
              </Button>
            </Form>
          </div>

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
