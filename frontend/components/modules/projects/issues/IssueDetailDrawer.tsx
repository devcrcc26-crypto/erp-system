'use client';

import {
  Descriptions,
  Drawer,
  Select,
  Spin,
} from 'antd';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { ApiRequestError } from '@/lib/api/errors';
import type { IssueStatus } from '@/lib/api/project-management.types';
import { ISSUE_WORKFLOW } from '@/lib/api/workflow';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useIssue, useUpdateIssue } from '@/lib/query/issues';
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
      open={open}
      onClose={onClose}
      title={issue ? `${issue.issueNumber} — ${issue.issueType}` : 'Issue detail'}
      size="large"
      destroyOnHidden
    >
      {issueQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      )}

      {issueQuery.isError && (
        <p className="text-sm text-slate-500">
          {issueQuery.error instanceof ApiRequestError
            ? issueQuery.error.message
            : 'Unable to load issue.'}
        </p>
      )}

      {issue && (
        <div className="space-y-6">
          <WorkflowStepper steps={ISSUE_WORKFLOW} currentStatus={issue.status} />

          <Descriptions column={1} size="small" bordered>
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

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
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
          </div>

          <DocumentAttachmentPanel
            readOnly
            title="Photos & drawings"
            description="Photo evidence and drawing references will be enabled when document folders are linked."
          />
        </div>
      )}
    </Drawer>
  );
}
