import OfficialSealDetailPageContent from "@/components/modules/hr/official-seal/OfficialSealDetailPageContent";

export default async function OfficialSealDetailPage({
    params,
}:{
    params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
    const { id } = await params;
    return <OfficialSealDetailPageContent sealId={id} />;
}