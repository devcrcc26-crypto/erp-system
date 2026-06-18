import DesignPackageReviewModeClient from './DesignPackageReviewModeClient';

export default async function DesignPackageReviewModePage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}): Promise<React.ReactNode> {
  const { packageId } = await params;
  return <DesignPackageReviewModeClient packageId={packageId} />;
}
