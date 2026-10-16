'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Radio,
  Skeleton,
  Space,
  Tabs,
  Timeline,
  Upload,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import { apiGet } from '@/lib/api/client';
import type { SubmittalStatus } from '@/lib/api/project-management.types';
import { SUBMITTAL_WORKFLOW } from '@/lib/api/workflow';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAddSubmittalReview,
  useSubmittal,
  useSubmittalReviews,
  useSubmitSubmittalToLead,
} from '@/lib/query/submittals';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { layout } from '@/lib/theme/layout';
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

interface DesignerRejectFormValues {
  comments?: string;
}

const LEAD_APPROVAL_OPTIONS: { value: SubmittalStatus; label: string }[] = [
  { value: 'APPROVED', label: 'Approve' },
  { value: 'APPROVED_WITH_COMMENTS', label: 'Approve with comments' },
  { value: 'REVISE_AND_RESUBMIT', label: 'Revise and resubmit' },
  { value: 'REJECTED', label: 'Reject' },
];

const OUTCOMES_NEEDING_COMMENT_OR_FILE = new Set<SubmittalStatus>([
  'APPROVED_WITH_COMMENTS',
  'REVISE_AND_RESUBMIT',
  'REJECTED',
]);

async function downloadDocumentById(documentId: string): Promise<void> {
  const { url } = await apiGet<{ url: string; expiresIn: number }>(
    `/documents/${documentId}/download-url`,
  );
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ConstructionSubmittalDetailPageContent({
  projectId,
  submittalId,
}: {
  projectId: string;
  submittalId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const resolveUserDisplay = useUserDisplayResolver();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [activeTab, setActiveTab] = useState('overview');
  const [designerRejectOpen, setDesignerRejectOpen] = useState(false);
  const [designerRejectFileId, setDesignerRejectFileId] = useState<
    string | null
  >(null);
  const [designerRejectFileName, setDesignerRejectFileName] = useState<
    string | null
  >(null);
  const [leadAttachmentId, setLeadAttachmentId] = useState<string | null>(null);
  const [leadAttachmentName, setLeadAttachmentName] = useState<string | null>(
    null,
  );
  const [leadOutcome, setLeadOutcome] = useState<SubmittalStatus | undefined>(
    'APPROVED',
  );

  const [designerForm] = Form.useForm<{ comments?: string }>();
  const [designerRejectForm] = Form.useForm<DesignerRejectFormValues>();
  const [leadForm] = Form.useForm<ReviewFormValues>();

  const submittalQuery = useSubmittal(projectId, submittalId);
  const reviewsQuery = useSubmittalReviews(projectId, submittalId);
  const addReview = useAddSubmittalReview();
  const submitToLead = useSubmitSubmittalToLead();
  const uploadDocument = useUploadDocumentToFolder();

  const submittal = submittalQuery.data;
  const reviews = reviewsQuery.data ?? [];

  const isExternalRelease =
    submittal?.submittalPurpose === 'DISCIPLINE_SITE' ||
    submittal?.submittalPurpose === 'DISCIPLINE_CONSULTANT';

  const isAssignedDesigner =
    Boolean(submittal?.assignedTo) && submittal?.assignedTo === currentUserId;
  const isStoredDisciplineLead =
    Boolean(submittal?.reviewedBy) && submittal?.reviewedBy === currentUserId;

  const canDesignerReview =
    Boolean(submittal) &&
    isAssignedDesigner &&
    submittal?.status === 'SUBMITTED';

  const canLeadApprove =
    Boolean(submittal) &&
    isStoredDisciplineLead &&
    submittal?.status === 'UNDER_REVIEW';

  const canResubmitToLead =
    submittal?.status === 'REVISE_AND_RESUBMIT' &&
    submittal?.submittedBy === currentUserId;

  const canUpload =
    submittal !== undefined &&
    submittal.submittedBy === currentUserId &&
    (submittal.status === 'DRAFT' || submittal.status === 'REVISE_AND_RESUBMIT');

  const latestReview =
    reviews.length > 0 ? reviews[reviews.length - 1] : undefined;
  const returnReview =
    [...reviews]
      .reverse()
      .find(
        (review) =>
          review.status === 'REVISE_AND_RESUBMIT' ||
          review.status === 'REJECTED' ||
          review.status === 'APPROVED_WITH_COMMENTS',
      ) ?? latestReview;

  const leadNeedsEvidence =
    leadOutcome !== undefined &&
    OUTCOMES_NEEDING_COMMENT_OR_FILE.has(leadOutcome);

  async function uploadReviewFile(
    file: File,
    onDone: (documentId: string, name: string) => void,
  ): Promise<void> {
    if (!submittal?.attachmentFolderId) {
      messageApi.error('Attachment folder is not available yet');
      return;
    }
    try {
      const uploaded = await uploadDocument.mutateAsync({
        folderId: submittal.attachmentFolderId,
        file,
      });
      onDone(uploaded.id, uploaded.name);
      messageApi.success('File attached to review');
    } catch (error) {
      notifyApiError(error, 'Failed to upload review file', messageApi);
    }
  }

  async function handleDesignerApprove(values: {
    comments?: string;
  }): Promise<void> {
    if (!submittal) {
      return;
    }
    try {
      await addReview.mutateAsync({
        projectId,
        submittalId,
        body: {
          status: 'APPROVED',
          comments: values.comments?.trim() || undefined,
          revisionNumber: submittal.revisionNumber,
        },
      });
      designerForm.resetFields();
      messageApi.success('Approved and sent to discipline leader');
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to record designer review', messageApi);
    }
  }

  async function handleDesignerReject(
    values: DesignerRejectFormValues,
  ): Promise<void> {
    if (!submittal) {
      return;
    }
    const comments = values.comments?.trim();
    if (!comments && !designerRejectFileId) {
      messageApi.error('Provide a comment or attach a file to reject');
      return;
    }
    try {
      await addReview.mutateAsync({
        projectId,
        submittalId,
        body: {
          status: 'REJECTED',
          comments: comments || undefined,
          attachmentDocumentId: designerRejectFileId ?? undefined,
          revisionNumber: submittal.revisionNumber,
        },
      });
      designerRejectForm.resetFields();
      setDesignerRejectOpen(false);
      setDesignerRejectFileId(null);
      setDesignerRejectFileName(null);
      messageApi.success('Submittal rejected');
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to reject submittal', messageApi);
    }
  }

  async function handleLeadApproval(values: ReviewFormValues): Promise<void> {
    if (!submittal) {
      return;
    }
    const comments = values.comments?.trim();
    if (
      OUTCOMES_NEEDING_COMMENT_OR_FILE.has(values.status) &&
      !comments &&
      !leadAttachmentId
    ) {
      messageApi.error('Provide a comment or attach a file for this outcome');
      return;
    }
    try {
      await addReview.mutateAsync({
        projectId,
        submittalId,
        body: {
          status: values.status,
          comments: comments || undefined,
          attachmentDocumentId: leadAttachmentId ?? undefined,
          revisionNumber: submittal.revisionNumber,
        },
      });
      leadForm.resetFields();
      setLeadOutcome('APPROVED');
      setLeadAttachmentId(null);
      setLeadAttachmentName(null);
      messageApi.success('Approval recorded');
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to record approval', messageApi);
    }
  }

  async function handleSubmitToLead(): Promise<void> {
    try {
      await submitToLead.mutateAsync({ projectId, submittalId });
      messageApi.success('Revised submittal resubmitted for designer review');
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit submittal', messageApi);
    }
  }

  if (submittalQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (submittalQuery.isError || !submittal) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load submittal"
        description={
          submittalQuery.error instanceof ApiRequestError
            ? submittalQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  const subtaskSummary =
    submittal.items.length > 0
      ? submittal.items
          .map(
            (item) =>
              `${item.fullSubtaskCode ?? item.packageCode ?? '-'} - ${
                item.packageName ?? 'Unknown subtask'
              }`,
          )
          .join('; ')
      : '-';

  return (
    <div className={layout.pageStack}>
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/submittals`)}
            className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to submittals
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text-primary)]">
            {submittal.submittalNumber} - {submittal.title}
          </h1>
          <StatusBadge
            label={formatSubmittalStatus(submittal.status)}
            variant={submittalStatusVariant(submittal.status)}
          />
        </div>
      </div>

      {isExternalRelease && (
        <Alert
          type="info"
          showIcon
          message="This is an external release, not a construction submittal."
          description={
            <Link href={`/projects/${projectId}/external-releases/${submittal.id}`}>
              Open the external release detail page →
            </Link>
          }
        />
      )}

      {!isExternalRelease && (
        <>
          <WorkflowStepper
            steps={SUBMITTAL_WORKFLOW}
            currentStatus={submittal.status}
          />

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            destroyOnHidden
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <div className="flex flex-col gap-6">
                    <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                      <Descriptions
                        className={layout.drawerDescriptionsClass}
                        column={{ xs: 1, sm: 2 }}
                        size="small"
                        bordered
                      >
                        <Descriptions.Item label="Submittal number">
                          {submittal.submittalNumber}
                        </Descriptions.Item>
                        <Descriptions.Item label="Title">
                          {submittal.title}
                        </Descriptions.Item>
                        <Descriptions.Item label="Category">
                          {submittal.category}
                        </Descriptions.Item>
                        <Descriptions.Item label="Subtask(s)">
                          {subtaskSummary}
                        </Descriptions.Item>
                        <Descriptions.Item label="Contractor">
                          {submittal.contractor ?? '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Supplier">
                          {submittal.supplier ?? '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Spec reference">
                          {submittal.specReference ?? '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Submitted by">
                          {resolveUserDisplay(
                            submittal.submittedBy,
                            submittal.submittedByName,
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Assigned to">
                          {resolveUserDisplay(
                            submittal.assignedTo,
                            submittal.assignedToName,
                            '-',
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Reviewed by">
                          {resolveUserDisplay(
                            submittal.reviewedBy,
                            submittal.reviewedByName,
                            '-',
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Status">
                          <StatusBadge
                            label={formatSubmittalStatus(submittal.status)}
                            variant={submittalStatusVariant(submittal.status)}
                          />
                        </Descriptions.Item>
                        <Descriptions.Item label="Revision number">
                          {submittal.revisionNumber}
                        </Descriptions.Item>
                        <Descriptions.Item label="Submission date">
                          {formatProjectDate(submittal.submissionDate)}
                        </Descriptions.Item>
                      </Descriptions>
                    </div>

                    <div className={layout.cardSurface + ' ' + layout.cardPadding}>
                      <p className={`mb-2 ${layout.drawerHeading}`}>
                        {submittal.title}
                      </p>
                      {submittal.specReference?.trim() && (
                        <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                          {submittal.specReference}
                        </p>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'documents',
                label: 'Documents',
                children: (
                  <DocumentAttachmentPanel
                    folderId={submittal.attachmentFolderId ?? undefined}
                    readOnly={!canUpload}
                    title="Attached files"
                    description={
                      canResubmitToLead
                        ? 'Upload revised files before resubmitting.'
                        : 'Files attached to this submittal.'
                    }
                  />
                ),
              },
              {
                key: 'review-history',
                label: 'Review history',
                children:
                  reviews.length === 0 ? (
                    <p className={layout.drawerMutedText}>
                      No reviews recorded yet.
                    </p>
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
                              {resolveUserDisplay(
                                review.reviewedBy,
                                review.reviewedByName,
                              )}
                            </p>
                            {review.comments && (
                              <p
                                className={`mt-2 whitespace-pre-wrap ${layout.drawerMutedText}`}
                              >
                                {review.comments}
                              </p>
                            )}
                            {review.attachmentDocumentId && (
                              <Button
                                type="link"
                                className="!mt-1 !px-0"
                                icon={<DownloadOutlined />}
                                onClick={() =>
                                  void downloadDocumentById(
                                    review.attachmentDocumentId!,
                                  )
                                }
                              >
                                {review.attachmentDocumentName ?? 'Download file'}
                              </Button>
                            )}
                          </div>
                        ),
                      }))}
                    />
                  ),
              },
            ]}
          />

          {/* Sticky bottom workflow bar */}
          <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-[var(--color-border-tertiary)] bg-white p-4">
            {submittal.status === 'APPROVED' && (
              <Alert
                type="success"
                showIcon
                title={`Approved on ${formatProjectDate(submittal.reviewDate ?? submittal.updatedAt)}`}
                description="This submittal is closed. Review history is above."
              />
            )}
            {submittal.status === 'APPROVED_WITH_COMMENTS' && (
              <Alert
                type="warning"
                showIcon
                title={`Approved with comments on ${formatProjectDate(submittal.reviewDate ?? submittal.updatedAt)}`}
                description={
                  returnReview?.comments
                    ? returnReview.comments
                    : 'Discipline leader approved with conditions. Read-only.'
                }
              />
            )}
            {submittal.status === 'REJECTED' && (
              <Alert
                type="error"
                showIcon
                title={`Rejected on ${formatProjectDate(submittal.reviewDate ?? submittal.updatedAt)}`}
                description={
                  returnReview?.comments
                    ? returnReview.comments
                    : 'This submittal was rejected. Read-only.'
                }
              />
            )}

            {canResubmitToLead && (
              <Alert
                type="warning"
                showIcon
                title="This submittal was returned for revision"
                description={
                  <div className="space-y-2">
                    <p>
                      Review the comments below, upload revised files, then
                      resubmit.
                    </p>
                    {returnReview?.comments && (
                      <p className="whitespace-pre-wrap font-medium">
                        Discipline leader: {returnReview.comments}
                      </p>
                    )}
                    {returnReview?.attachmentDocumentId && (
                      <Button
                        type="link"
                        className="!px-0"
                        icon={<DownloadOutlined />}
                        onClick={() =>
                          void downloadDocumentById(
                            returnReview.attachmentDocumentId!,
                          )
                        }
                      >
                        {returnReview.attachmentDocumentName ??
                          'Download return attachment'}
                      </Button>
                    )}
                  </div>
                }
                action={
                  <Button
                    type="primary"
                    loading={submitToLead.isPending}
                    onClick={() => void handleSubmitToLead()}
                  >
                    Resubmit
                  </Button>
                }
              />
            )}

            {canDesignerReview && (
              <div className="rounded border border-[var(--color-border)] p-4">
                <h4 className={`${layout.drawerHeading} mb-2`}>
                  Designer review
                </h4>
                <p className={`mb-4 ${layout.drawerMutedText}`}>
                  Review the attached files. Approve to send to the discipline
                  leader, or reject with a comment or file.
                </p>
                {!designerRejectOpen ? (
                  <Space orientation="vertical" className="w-full">
                    <Form
                      form={designerForm}
                      layout="vertical"
                      className="erp-drawer-form"
                      onFinish={(values: { comments?: string }) =>
                        void handleDesignerApprove(values)
                      }
                    >
                      <Form.Item label="Comments (optional)" name="comments">
                        <Input.TextArea
                          rows={3}
                          placeholder="Optional notes for the discipline leader"
                        />
                      </Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={addReview.isPending}
                      >
                        Approve and send to Discipline Leader
                      </Button>
                    </Form>
                    <Button
                      danger
                      block
                      onClick={() => setDesignerRejectOpen(true)}
                    >
                      Reject
                    </Button>
                  </Space>
                ) : (
                  <Form
                    form={designerRejectForm}
                    layout="vertical"
                    className="erp-drawer-form"
                    onFinish={(values: DesignerRejectFormValues) =>
                      void handleDesignerReject(values)
                    }
                  >
                    <Form.Item label="Rejection comment" name="comments">
                      <Input.TextArea
                        rows={3}
                        placeholder="Required if no file is attached"
                      />
                    </Form.Item>
                    <Form.Item label="Attachment (optional if comment provided)">
                      <Upload
                        maxCount={1}
                        showUploadList={Boolean(designerRejectFileName)}
                        beforeUpload={(file: File) => {
                          void uploadReviewFile(file, (id, name) => {
                            setDesignerRejectFileId(id);
                            setDesignerRejectFileName(name);
                          });
                          return false;
                        }}
                        onRemove={() => {
                          setDesignerRejectFileId(null);
                          setDesignerRejectFileName(null);
                        }}
                        fileList={
                          designerRejectFileName
                            ? [
                                {
                                  uid: '1',
                                  name: designerRejectFileName,
                                  status: 'done',
                                },
                              ]
                            : []
                        }
                      >
                        <Button
                          icon={<UploadOutlined />}
                          loading={uploadDocument.isPending}
                        >
                          Attach file
                        </Button>
                      </Upload>
                    </Form.Item>
                    <Space className="w-full" orientation="vertical">
                      <Button
                        danger
                        type="primary"
                        htmlType="submit"
                        block
                        loading={addReview.isPending}
                      >
                        Confirm rejection
                      </Button>
                      <Button
                        block
                        onClick={() => {
                          setDesignerRejectOpen(false);
                          setDesignerRejectFileId(null);
                          setDesignerRejectFileName(null);
                          designerRejectForm.resetFields();
                        }}
                      >
                        Cancel
                      </Button>
                    </Space>
                  </Form>
                )}
              </div>
            )}

            {canLeadApprove && (
              <div className="rounded border border-[var(--color-border)] p-4">
                <h4 className={`${layout.drawerHeading} mb-2`}>
                  Discipline Leader approval
                </h4>
                <Form<ReviewFormValues>
                  form={leadForm}
                  layout="vertical"
                  className="erp-drawer-form"
                  initialValues={{ status: 'APPROVED' }}
                  onValuesChange={(changed) => {
                    if (changed.status !== undefined) {
                      setLeadOutcome(changed.status);
                    }
                  }}
                  onFinish={(values: ReviewFormValues) =>
                    void handleLeadApproval(values)
                  }
                >
                  <Form.Item
                    label="Outcome"
                    name="status"
                    rules={[
                      { required: true, message: 'Select an approval outcome' },
                    ]}
                  >
                    <Radio.Group
                      options={LEAD_APPROVAL_OPTIONS}
                      optionType="button"
                      className="flex flex-wrap gap-1"
                    />
                  </Form.Item>
                  {leadNeedsEvidence && (
                    <>
                      <Form.Item
                        label="Comment"
                        name="comments"
                        extra="Required unless a file is attached"
                      >
                        <Input.TextArea
                          rows={4}
                          placeholder="Required - provide comment or attach file"
                        />
                      </Form.Item>
                      <Form.Item label="Attachment (optional if comment provided)">
                        <Upload
                          maxCount={1}
                          showUploadList={Boolean(leadAttachmentName)}
                          beforeUpload={(file: File) => {
                            void uploadReviewFile(file, (id, name) => {
                              setLeadAttachmentId(id);
                              setLeadAttachmentName(name);
                            });
                            return false;
                          }}
                          onRemove={() => {
                            setLeadAttachmentId(null);
                            setLeadAttachmentName(null);
                          }}
                          fileList={
                            leadAttachmentName
                              ? [
                                  {
                                    uid: '1',
                                    name: leadAttachmentName,
                                    status: 'done',
                                  },
                                ]
                              : []
                          }
                        >
                          <Button
                            icon={<UploadOutlined />}
                            loading={uploadDocument.isPending}
                          >
                            Attach file
                          </Button>
                        </Upload>
                      </Form.Item>
                    </>
                  )}
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={addReview.isPending}
                  >
                    Submit
                  </Button>
                </Form>
              </div>
            )}

            {!canDesignerReview &&
              !canLeadApprove &&
              submittal.status === 'SUBMITTED' && (
                <Alert
                  type="info"
                  showIcon
                  title="Awaiting designer review"
                  description="This submittal is with the assigned subtask designer."
                />
              )}

            {!canDesignerReview &&
              !canLeadApprove &&
              submittal.status === 'UNDER_REVIEW' && (
                <Alert
                  type="info"
                  showIcon
                  title="Awaiting discipline leader approval"
                  description="The designer has approved. Waiting for the discipline leader."
                />
              )}
          </div>
        </>
      )}
    </div>
  );
}
