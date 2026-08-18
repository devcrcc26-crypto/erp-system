import CompanyAssetFormContent from '@/components/modules/hr/company-asset/CompanyAssetFormContent';

export default async function EditCompanyAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <CompanyAssetFormContent assetId={id} />;
}
