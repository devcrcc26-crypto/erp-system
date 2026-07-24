// UI polish pass - styles only, no logic changes

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
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';
import { useIssue, useUpdateIssue } from '@/lib/query/issues';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatIssueStatus,
  issueSeverityVariant,
  issueStatusVariant,
} from '@/lib/utils/pm-status-display';
import {
  ISSUE_VALID_TRANSITIONS,
  nextStatusOptions,
} from '@/lib/utils/pm-status-transitions';

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
  const resolveUserDisplay = useUserDisplayResolver();
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
      title={issue ? `${issue.issueNumber} - ${issue.issueType}` : 'Issue detail'}
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
              {issue.location ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Raised by">
              {resolveUserDisplay(issue.raisedBy, issue.raisedByName)}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned to">
              {resolveUserDisplay(issue.assignedTo, issue.assignedToName, '-')}
            </Descriptions.Item>
            <Descriptions.Item label="Due date">
              {formatProjectDate(issue.dueDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Resolved">
              {issue.resolvedAt
                ? `${formatProjectDate(issue.resolvedAt)} — ${resolveUserDisplay(issue.resolvedBy, issue.resolvedByName, '—')}`
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Verified">
              {issue.verifiedAt
                ? `${formatProjectDate(issue.verifiedAt)} — ${resolveUserDisplay(issue.verifiedBy, issue.verifiedByName, '—')}`
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Description">
              {issue.description}
            </Descriptions.Item>
            {issue.sourceEntitySummary && (
              <Descriptions.Item label="Source">
                {issue.sourceEntitySummary.type.replace(/_/g, ' ')} — {issue.sourceEntitySummary.label}
              </Descriptions.Item>
            )}
          </Descriptions>

          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>
              Update status
            </p>
            {nextStatusOptions(issue.status, ISSUE_VALID_TRANSITIONS).length === 0 ? (
              <StatusBadge
                label={formatIssueStatus(issue.status)}
                variant={issueStatusVariant(issue.status)}
              />
            ) : (
              <Select
                className="w-full max-w-xs"
                value={issue.status}
                onChange={(value: IssueStatus) => void handleStatusChange(value)}
                loading={updateIssue.isPending}
                options={nextStatusOptions(issue.status, ISSUE_VALID_TRANSITIONS).map(
                  (status) => ({
                    value: status,
                    label: formatIssueStatus(status),
                  }),
                )}
              />
            )}
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
