import MaterialRequisitionDetailPageContent from '@/components/modules/hr/material-requisition/MaterialRequisitionDetailPageContent';

export default async function MaterialRequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <MaterialRequisitionDetailPageContent requisitionId={id} />;
}
