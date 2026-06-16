import ProjectShell from '@/components/modules/projects/ProjectShell';

export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;

  return <ProjectShell projectId={projectId}>{children}</ProjectShell>;
}
