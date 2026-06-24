// UI polish pass — styles only, no logic changes

'use client';

import {
  Alert,
  Descriptions,
  Drawer,
  Select,
} from 'antd';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type { IssueStatus } from '@/lib/api/project-management.types';
import { ISSUE_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useIssue, useUpdateIssue } from '@/lib/query/issues';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  issueSeverityVariant,
  issueStatusVariant,
} from '@/lib/utils/pm-status-display';

export default function IssueDetailDrawer({
  projectId,
  issueId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  issueId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const resolveUserName = useUserNameLookup();
  const open = Boolean(issueId);
  const issueQuery = useIssue(projectId, issueId ?? '', open);
  const updateIssue = useUpdateIssue();
  const issue = issueQuery.data;

  async function handleStatusChange(status: IssueStatus): Promise<void> {
    if (!issueId || !issue) {
      return;
    }
    await updateIssue.mutateAsync({
      projectId,
      issueId,
      body: { status },
    });
    onUpdated();
    void issueQuery.refetch();
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={issue ? `${issue.issueNumber} — ${issue.issueType}` : 'Issue detail'}
      destroyOnHidden
    >
      {issueQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-32 w-full rounded" />
        </div>
      )}

      {issueQuery.isError && (
        <p className={layout.drawerMutedText}>
          {issueQuery.error instanceof ApiRequestError
            ? issueQuery.error.message
            : 'Unable to load issue.'}
        </p>
      )}

      {issue && (
        <div className={layout.drawerStack}>
          <WorkflowStepper
            className="erp-drawer-workflow"
            steps={ISSUE_WORKFLOW}
            currentStatus={issue.status}
          />

          <Descriptions
            className={layout.drawerDescriptionsClass}
            column={1}
            size="small"
            bordered
          >
            <Descriptions.Item label="Status">
              <StatusBadge
                label={formatIssueStatus(issue.status)}
                variant={issueStatusVariant(issue.status)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Severity">
              <StatusBadge
                label={issue.severity}
                variant={issueSeverityVariant(issue.severity)}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Location">
              {issue.location ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Raised by">
              {resolveUserName(issue.raisedBy)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {issue.assignedTo ? resolveUserName(issue.assignedTo) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(issue.dueDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Resolved">
              {formatProjectDate(issue.resolvedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="Verified">
              {formatProjectDate(issue.verifiedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="Description">
              {issue.description}
            </Descriptions.Item>
          </Descriptions>

          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>
              Update status
            </p>
            <Select
              className="w-full max-w-xs"
              value={issue.status}
              onChange={(value: IssueStatus) => void handleStatusChange(value)}
              loading={updateIssue.isPending}
              options={ISSUE_WORKFLOW.map((step) => ({
                value: step.key,
                label: step.label,
              }))}
            />
          </section>

          <DocumentAttachmentPanel
            folderId={issue.attachmentFolderId ?? undefined}
            title="Photos & drawings"
            description="Upload site photos, sketches, or drawing references for this issue."
          />

          <Alert
            type="info"
            showIcon
            className="mt-4"
            title="EPC revision"
            description="For defects tied to engineering documents, use Trigger Revision from the engineering document detail page after linking the issue in correspondence."
          />
        </div>
      )}
    </Drawer>
  );
}
