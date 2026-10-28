import MaterialRequisitionEditPageContent from '@/components/modules/hr/material-requisition/MaterialRequisitionEditPageContent';

export default async function EditMaterialRequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <MaterialRequisitionEditPageContent requisitionId={id} />;
}
