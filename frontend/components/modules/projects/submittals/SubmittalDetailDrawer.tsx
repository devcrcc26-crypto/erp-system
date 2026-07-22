// UI polish pass - styles only, no logic changes

'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Timeline,
  Upload,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
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
  useUpdateSubmittal,
} from '@/lib/query/submittals';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
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
import ExternalReleaseDocumentsSection from '@/components/modules/projects/submittals/ExternalReleaseDocumentsSection';

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
  const [designerForm] = Form.useForm<{ comments?: string }>();
  const [designerRejectForm] = Form.useForm<DesignerRejectFormValues>();
  const [leadForm] = Form.useForm<ReviewFormValues>();
  const open = Boolean(submittalId);
  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const uploadDocument = useUploadDocumentToFolder();

  const submittalQuery = useSubmittal(projectId, submittalId ?? '', open);
  const reviewsQuery = useSubmittalReviews(projectId, submittalId ?? '', open);
  const addReview = useAddSubmittalReview();
  const submitToLead = useSubmitSubmittalToLead();
  const updateSubmittal = useUpdateSubmittal();

  const submittal = submittalQuery.data;
  const reviews = reviewsQuery.data ?? [];
  const isConstruction = submittal?.submittalPurpose === 'IN_CONSTRUCTION';
  const isExternalRelease =
    submittal?.submittalPurpose === 'DISCIPLINE_SITE' ||
    submittal?.submittalPurpose === 'DISCIPLINE_CONSULTANT';

  const isAssignedDesigner =
    Boolean(submittal?.assignedTo) &&
    submittal?.assignedTo === currentUserId;
  const isStoredDisciplineLead =
    Boolean(submittal?.reviewedBy) &&
    submittal?.reviewedBy === currentUserId;

  const canDesignerReview =
    isConstruction &&
    isAssignedDesigner &&
    submittal?.status === 'SUBMITTED';

  const canLeadApprove =
    isConstruction &&
    isStoredDisciplineLead &&
    submittal?.status === 'UNDER_REVIEW';

  const canResubmitToLead =
    isConstruction &&
    submittal?.status === 'REVISE_AND_RESUBMIT' &&
    submittal?.submittedBy === currentUserId;

  const canUpload =
    submittal !== undefined &&
    submittal.submittedBy === currentUserId &&
    (submittal.status === 'DRAFT' ||
      submittal.status === 'REVISE_AND_RESUBMIT');

  const showDirectStatusControl =
    submittal !== undefined &&
    !isConstruction &&
    !SUBMITTAL_VERDICT_STATUSES.includes(submittal.status) &&
    nextStatusOptions(submittal.status, SUBMITTAL_DIRECT_TRANSITIONS).length >
      0;

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

  const leadOutcome = Form.useWatch('status', leadForm) as
    | SubmittalStatus
    | undefined;
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
    if (!submittalId || !submittal) {
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
      onUpdated();
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to record designer review', messageApi);
    }
  }

  async function handleDesignerReject(
    values: DesignerRejectFormValues,
  ): Promise<void> {
    if (!submittalId || !submittal) {
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
      onUpdated();
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to reject submittal', messageApi);
    }
  }

  async function handleLeadApproval(values: ReviewFormValues): Promise<void> {
    if (!submittalId || !submittal) {
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
      setLeadAttachmentId(null);
      setLeadAttachmentName(null);
      messageApi.success('Approval recorded');
      onUpdated();
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to record approval', messageApi);
    }
  }

  async function handleSubmitToLead(): Promise<void> {
    if (!submittalId) {
      return;
    }
    try {
      await submitToLead.mutateAsync({ projectId, submittalId });
      messageApi.success('Revised submittal resubmitted for designer review');
      onUpdated();
      void reviewsQuery.refetch();
      void submittalQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to submit submittal', messageApi);
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

          {isConstruction && submittal.status === 'APPROVED' && (
            <Alert
              type="success"
              showIcon
              title={`Approved on ${formatProjectDate(submittal.reviewDate ?? submittal.updatedAt)}`}
              description="This submittal is closed. Review history is below."
            />
          )}
          {isConstruction && submittal.status === 'APPROVED_WITH_COMMENTS' && (
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
          {isConstruction && submittal.status === 'REJECTED' && (
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
            <Descriptions.Item label="Discipline leader">
              {resolveUserDisplay(submittal.reviewedBy, submittal.reviewedByName, '-')}
            </Descriptions.Item>
            <Descriptions.Item label="Submission date">
              {formatProjectDate(submittal.submissionDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(submittal.dueDate)}
            </Descriptions.Item>
            {isExternalRelease && (
              <Descriptions.Item label="Issued">
                {submittal.issuedAt
                  ? `Issued by ${resolveUserDisplay(submittal.submittedBy, submittal.submittedByName)} on ${formatProjectDate(submittal.issuedAt)}`
                  : 'Not yet issued'}
              </Descriptions.Item>
            )}
          </Descriptions>

          {showDirectStatusControl && (
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Update status</p>
              <Select
                className="w-full"
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

          {isExternalRelease && submittalId && (
            <ExternalReleaseDocumentsSection
              projectId={projectId}
              submittal={submittal}
              submittalId={submittalId}
              onUpdated={() => {
                onUpdated();
                void submittalQuery.refetch();
              }}
            />
          )}

          {!isExternalRelease && submittal.items.length > 0 && (
            <div>
              <h3 className={`${layout.drawerHeading} mb-2`}>
                Linked subtasks
              </h3>
              <div className="erp-drawer-list">
                {submittal.items.map((item) => (
                  <div key={item.id} className={`px-4 py-3 ${layout.drawerMutedText}`}>
                    {item.packageCode ?? '—'} — {item.packageName ?? 'Unknown subtask'}
                    {!item.snapshotCaptured ? ' (pending)' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isExternalRelease && submittal.attachmentFolderId && (
            <div className="mt-4">
              <h4 className={`${layout.drawerHeading} mb-2`}>Attached files</h4>
              <DocumentAttachmentPanel
                folderId={submittal.attachmentFolderId}
                readOnly={!canUpload}
                title=""
                description={
                  canResubmitToLead
                    ? 'Upload revised files before resubmitting.'
                    : ''
                }
              />
            </div>
          )}

          {canResubmitToLead && (
            <Alert
              type="warning"
              showIcon
              className="mt-4"
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
            <div className="mt-4 rounded border border-[var(--color-border)] p-4">
              <h4 className={`${layout.drawerHeading} mb-2`}>
                Designer review
              </h4>
              <p className={`mb-4 ${layout.drawerMutedText}`}>
                Review the attached files. Approve to send to the discipline
                leader, or reject with a comment or file.
              </p>
              {!designerRejectOpen ? (
                <Space direction="vertical" className="w-full">
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
                  <Space className="w-full" direction="vertical">
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
            <div className="mt-4 rounded border border-[var(--color-border)] p-4">
              <h4 className={`${layout.drawerHeading} mb-2`}>
                Discipline Leader approval
              </h4>
              <Form<ReviewFormValues>
                form={leadForm}
                layout="vertical"
                className="erp-drawer-form"
                initialValues={{ status: 'APPROVED' }}
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
                        placeholder="Required — provide comment or attach file"
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
            isConstruction &&
            submittal.status === 'SUBMITTED' && (
              <Alert
                type="info"
                showIcon
                className="mt-4"
                title="Awaiting designer review"
                description="This submittal is with the assigned subtask designer."
              />
            )}

          {!canDesignerReview &&
            !canLeadApprove &&
            isConstruction &&
            submittal.status === 'UNDER_REVIEW' && (
              <Alert
                type="info"
                showIcon
                className="mt-4"
                title="Awaiting discipline leader approval"
                description="The designer has approved. Waiting for the discipline leader."
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
            )}
          </section>

          {isExternalRelease && (
            <Alert
              type="info"
              showIcon
              className="mt-4"
              title="External feedback is handled outside the system. Create an Issue, RFI, or Change Request to action any feedback received."
            />
          )}
        </div>
      )}
    </Drawer>
  );
}
