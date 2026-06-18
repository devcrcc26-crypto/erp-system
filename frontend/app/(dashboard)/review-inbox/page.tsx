import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default function ReviewInboxPage(): React.ReactNode {
  return (
    <EpcWorkspacePlaceholder
      title="Review Inbox"
      description="Assigned review sessions across all projects with SLA status will appear here."
    />
  );
}
