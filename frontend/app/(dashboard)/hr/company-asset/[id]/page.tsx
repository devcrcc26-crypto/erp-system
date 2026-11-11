import CompanyAssetDetailPageContent from '@/components/modules/hr/company-asset/CompanyAssetDetailPageContent';

export default async function CompanyAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <CompanyAssetDetailPageContent assetId={id} />;
}
