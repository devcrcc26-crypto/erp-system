import ProjectShell from '@/components/modules/projects/ProjectShell';
import { RoleLensProvider } from '@/components/modules/projects/workspaces/RoleLensProvider';

export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;

  return (
    <RoleLensProvider>
      <ProjectShell projectId={projectId}>{children}</ProjectShell>
    </RoleLensProvider>
  );
}
