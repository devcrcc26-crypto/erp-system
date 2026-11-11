'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Skeleton,
  Space,
} from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { ApiRequestError } from '@/lib/api/errors';
import { PUNCH_ITEM_WORKFLOW } from '@/lib/api/workflow';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useAssignPunchItem,
  useClosePunchItem,
  useCorrectPunchItem,
  usePunchItem,
  useReopenPunchItem,
  useVerifyPunchItem,
} from '@/lib/query/punch-items';
import { layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatPunchCategory,
  formatPunchItemStatus,
  punchItemSeverityVariant,
  punchItemStatusVariant,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';

interface AssignFormValues {
  assignedTo: string;
}

interface CorrectFormValues {
  resolutionNote: string;
}

interface ReopenFormValues {
  reason?: string;
}

export default function PunchItemDetailPageContent({
  projectId,
  punchItemId,
}: {
  projectId: string;
  punchItemId: string;
}): React.ReactNode {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [assignForm] = Form.useForm<AssignFormValues>();
  const [correctForm] = Form.useForm<CorrectFormValues>();
  const [reopenForm] = Form.useForm<ReopenFormValues>();

  const resolveUserDisplay = useUserDisplayResolver();
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const itemQuery = usePunchItem(projectId, punchItemId);
  const assignItem = useAssignPunchItem();
  const correctItem = useCorrectPunchItem();
  const verifyItem = useVerifyPunchItem();
  const closeItem = useClosePunchItem();
  const reopenItem = useReopenPunchItem();

  const item = itemQuery.data;
  const isRaiser = item?.raisedBy === currentUserId;
  const isAssignee = item?.assignedTo === currentUserId;
  const hasFullAccess = pm.projects.canView;

  const dueOverdue =
    Boolean(item?.dueDate) &&
    new Date(item!.dueDate!) < new Date() &&
    item != null &&
    !['VERIFIED', 'CLOSED'].includes(item.status);

  useEffect(() => {
    assignForm.resetFields();
    correctForm.resetFields();
    reopenForm.resetFields();
    setAssignOpen(false);
    setCorrectOpen(false);
    setReopenOpen(false);
  }, [punchItemId, assignForm, correctForm, reopenForm]);

  async function afterAction(successMessage: string): Promise<void> {
    messageApi.success(successMessage);
    void itemQuery.refetch();
  }

  async function handleAssign(): Promise<void> {
    try {
      const values = await assignForm.validateFields();
      await assignItem.mutateAsync({
        projectId,
        punchItemId,
        assignedTo: values.assignedTo,
      });
      assignForm.resetFields();
      setAssignOpen(false);
      await afterAction('Punch item assigned');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, 'Failed to assign punch item', messageApi);
    }
  }

  async function handleCorrect(): Promise<void> {
    try {
      const values = await correctForm.validateFields();
      await correctItem.mutateAsync({
        projectId,
        punchItemId,
        resolutionNote: values.resolutionNote.trim(),
      });
      correctForm.resetFields();
      setCorrectOpen(false);
      await afterAction('Punch item marked as corrected');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, 'Failed to mark punch item corrected', messageApi);
    }
  }

  function handleVerify(): void {
    Modal.confirm({
      title: 'Verify Fix',
      content:
        'Confirm that this defect has been properly corrected and is acceptable?',
      okText: 'Verify',
      onOk: async () => {
        try {
          await verifyItem.mutateAsync({ projectId, punchItemId });
          await afterAction('Fix verified');
        } catch (error) {
          notifyApiError(error, 'Failed to verify punch item', messageApi);
          throw error;
        }
      },
    });
  }

  function handleCloseConfirm(): void {
    Modal.confirm({
      title: 'Close Punch Item',
      content:
        'Close this item? It will be marked as complete and finalized.',
      okText: 'Close',
      onOk: async () => {
        try {
          await closeItem.mutateAsync({ projectId, punchItemId });
          await afterAction('Punch item closed');
        } catch (error) {
          notifyApiError(error, 'Failed to close punch item', messageApi);
          throw error;
        }
      },
    });
  }

  async function handleReopen(): Promise<void> {
    try {
      const values = await reopenForm.validateFields();
      await reopenItem.mutateAsync({
        projectId,
        punchItemId,
        reason: values.reason?.trim() || undefined,
      });
      reopenForm.resetFields();
      setReopenOpen(false);
      await afterAction('Punch item reopened');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, 'Failed to reopen punch item', messageApi);
    }
  }

  if (itemQuery.isLoading && !item) {
    return (
      <div className={layout.pageStack}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (itemQuery.isError || !item) {
    return (
      <Alert
        type="error"
        showIcon
        title="Unable to load punch item"
        description={
          itemQuery.error instanceof ApiRequestError
            ? itemQuery.error.message
            : 'Please refresh the page.'
        }
        className="m-6"
      />
    );
  }

  return (
    <ProjectModuleGate projectId={projectId} module="punch_items">
      <div className={layout.pageStack}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(`/projects/${projectId}/punch-list`)
              }
              className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft size={14} />
              Back to punch list
            </button>
            <span className="text-[var(--color-border)]">/</span>
            <h1 className="font-mono text-base font-semibold leading-tight text-[var(--color-text-primary)]">
              {item.punchNumber}
            </h1>
            <span className="max-w-[360px] truncate text-sm text-[var(--color-text-secondary)]">
              {item.title}
            </span>
            <StatusBadge
              label={formatPunchItemStatus(item.status)}
              variant={punchItemStatusVariant(item.status)}
            />
          </div>
        </div>

        <div className={`${layout.cardSurface} ${layout.cardPadding}`}>
          <div className="flex flex-col gap-6">
            <WorkflowStepper
              steps={PUNCH_ITEM_WORKFLOW}
              currentStatus={item.status}
            />

            <Descriptions
              className={layout.drawerDescriptionsClass}
              column={{ xs: 1, sm: 2 }}
              size="small"
              bordered
            >
              <Descriptions.Item label="Title" span={2}>
                {item.title}
              </Descriptions.Item>
              {item.category && (
                <Descriptions.Item label="Category">
                  {formatPunchCategory(item.category)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Severity">
                <StatusBadge
                  label={item.severity}
                  variant={punchItemSeverityVariant(item.severity)}
                />
              </Descriptions.Item>
              {item.roomOrArea && (
                <Descriptions.Item label="Location / Area">
                  {item.roomOrArea}
                </Descriptions.Item>
              )}
              {item.tradeResponsible && (
                <Descriptions.Item label="Trade Responsible">
                  {item.tradeResponsible}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Raised By">
                {resolveUserDisplay(item.raisedBy, item.raisedByName)}
              </Descriptions.Item>
              <Descriptions.Item label="Assigned To">
                {item.assignedTo
                  ? resolveUserDisplay(item.assignedTo, item.assignedToName)
                  : '-'}
              </Descriptions.Item>
              {item.dueDate && (
                <Descriptions.Item label="Due Date">
                  <span
                    className={
                      dueOverdue ? 'font-medium text-red-600' : undefined
                    }
                  >
                    {formatProjectDate(item.dueDate)}
                  </span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Created On">
                {formatProjectDate(item.createdAt)}
              </Descriptions.Item>
              {item.taskDisciplineId && (
                <Descriptions.Item label="Discipline">
                  {item.disciplineName ?? '-'}
                </Descriptions.Item>
              )}
              {item.designPackageId && (
                <Descriptions.Item label="Subtask">
                  {item.packageCode
                    ? `${item.packageCode} - ${item.packageName ?? ''}`
                    : '-'}
                </Descriptions.Item>
              )}
            </Descriptions>

            <section>
              <p className={`mb-2 ${layout.drawerHeading}`}>Description</p>
              <div className={layout.drawerSurface}>
                <p className="whitespace-pre-wrap text-sm">{item.description}</p>
              </div>
            </section>

            {item.resolutionNote && (
              <section>
                <p className={`mb-2 ${layout.drawerHeading}`}>Resolution</p>
                <div className={layout.drawerSurface}>
                  <p className="whitespace-pre-wrap text-sm">
                    {item.resolutionNote}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Corrected on {formatProjectDate(item.correctedAt)}
                  </p>
                </div>
              </section>
            )}

            {item.verifiedAt && (
              <section>
                <p className={`mb-2 ${layout.drawerHeading}`}>Verification</p>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-800">
                    Verified by{' '}
                    {item.verifiedBy
                      ? resolveUserDisplay(
                          item.verifiedBy,
                          item.verifiedByName,
                        )
                      : (item.verifiedByName ?? '-')}{' '}
                    on {formatProjectDate(item.verifiedAt)}
                  </p>
                </div>
              </section>
            )}

            {item.closedAt && (
              <section>
                <p className={`mb-2 ${layout.drawerHeading}`}>Closure</p>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-800">
                    Closed by{' '}
                    {item.closedBy
                      ? resolveUserDisplay(item.closedBy, item.closedByName)
                      : (item.closedByName ?? '-')}{' '}
                    on {formatProjectDate(item.closedAt)}
                  </p>
                </div>
              </section>
            )}

            <section>
              <DocumentAttachmentPanel
                folderId={item.attachmentFolderId ?? undefined}
                readOnly={item.status === 'CLOSED'}
                title="Defect photos"
                description="Before/after photos and drawing references."
              />
            </section>

            <Space wrap>
              {item.status === 'RAISED' && (
                <Button type="primary" onClick={() => setAssignOpen(true)}>
                  Assign
                </Button>
              )}

              {item.status === 'ASSIGNED' &&
                (isAssignee || hasFullAccess) && (
                  <Button type="primary" onClick={() => setCorrectOpen(true)}>
                    Mark Corrected
                  </Button>
                )}

              {item.status === 'CORRECTED' &&
                (isRaiser || hasFullAccess) &&
                !isAssignee && (
                  <>
                    <Button type="primary" onClick={() => handleVerify()}>
                      Verify Fix
                    </Button>
                    <Button onClick={() => setReopenOpen(true)}>Reopen</Button>
                  </>
                )}

              {item.status === 'CORRECTED' &&
                isAssignee &&
                !isRaiser &&
                !hasFullAccess && (
                  <Alert
                    type="info"
                    showIcon
                    message="Waiting for the person who raised this item to verify your fix."
                  />
                )}

              {item.status === 'VERIFIED' && (isRaiser || hasFullAccess) && (
                <>
                  <Button type="primary" onClick={() => handleCloseConfirm()}>
                    Close Punch Item
                  </Button>
                  <Button onClick={() => setReopenOpen(true)}>Reopen</Button>
                </>
              )}

              {item.status === 'CLOSED' && (isRaiser || hasFullAccess) && (
                <Button onClick={() => setReopenOpen(true)}>
                  Reopen Punch Item
                </Button>
              )}
            </Space>
          </div>
        </div>

        <Modal
          title="Assign Punch Item"
          open={assignOpen}
          forceRender
          onOk={() => void handleAssign()}
          onCancel={() => {
            assignForm.resetFields();
            setAssignOpen(false);
          }}
          okText="Assign"
          confirmLoading={assignItem.isPending}
        >
          <Form form={assignForm} layout="vertical">
            <Form.Item
              name="assignedTo"
              label="Assign to"
              rules={[{ required: true, message: 'Select a person to assign' }]}
            >
              <UserSelect placeholder="Select person to fix this" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Mark as Corrected"
          open={correctOpen}
          forceRender
          onOk={() => void handleCorrect()}
          onCancel={() => {
            correctForm.resetFields();
            setCorrectOpen(false);
          }}
          okText="Mark Corrected"
          width={520}
          confirmLoading={correctItem.isPending}
        >
          <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
            Describe what was done to fix this defect.
          </p>
          <Form form={correctForm} layout="vertical">
            <Form.Item
              name="resolutionNote"
              label="Resolution note"
              rules={[
                {
                  required: true,
                  message: 'Describe what was done to fix the defect',
                },
              ]}
            >
              <Input.TextArea
                rows={4}
                placeholder="What was done to fix the defect? Include method, materials, and any follow-up required."
              />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Reopen Punch Item"
          open={reopenOpen}
          forceRender
          onOk={() => void handleReopen()}
          onCancel={() => {
            reopenForm.resetFields();
            setReopenOpen(false);
          }}
          okText="Reopen"
          confirmLoading={reopenItem.isPending}
        >
          <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
            This item will return to Assigned status for re-correction.
          </p>
          <Form form={reopenForm} layout="vertical">
            <Form.Item name="reason" label="Reason for reopening">
              <Input.TextArea
                rows={3}
                placeholder="Why is this being reopened?"
              />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </ProjectModuleGate>
  );
}
