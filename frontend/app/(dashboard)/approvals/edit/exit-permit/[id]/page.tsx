import ExitPermitEditPageContent from '@/components/modules/hr/exit-permit/ExitPermitEditPageContent';

export default async function EditExitPermitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ExitPermitEditPageContent permitId={id} />;
}
