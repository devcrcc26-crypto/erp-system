import CloseoutPageContent from '@/components/modules/projects/closeout/CloseoutPageContent';

export default async function ProjectCloseoutPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <CloseoutPageContent projectId={projectId} />;
}
